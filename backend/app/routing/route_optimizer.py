# -*- coding: utf-8 -*-
"""Navigation grid + A* / Dijkstra route optimization.

The navigation area is represented as a grid in lat/lon space, projected to
a locally flat (meters) coordinate frame for distance calculations. Each cell
carries a composite cost built from:
- distance
- sea-ice concentration penalty
- iceberg proximity penalty (current + predicted)
- weather risk penalty
- wave penalty
- ocean-current assistance penalty (favorable current reduces cost)
- fuel estimate (linked to the fuel model)

A* (8-connectivity) finds the lowest-cost path from start to destination.
Dijkstra is provided as a fallback / comparison.

Both algorithms operate on the actual grid — no fake straight lines.
"""

from __future__ import annotations

import heapq
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.services.synthetic_data import haversin_nm
from app.services.feature_engineering import distance_nm


# Grid resolution: degrees per cell. ~0.5 deg ~ 55 km at these latitudes.
DEFAULT_GRID_STEP_DEG = 0.5

# Action set: 8-connectivity with move costs (unitless). Diagonal moves cost sqrt(2).
MOVES: List[Tuple[float, float, float]] = [
    (1.0, 0.0, 1.0),
    (-1.0, 0.0, 1.0),
    (0.0, 1.0, 1.0),
    (0.0, -1.0, 1.0),
    (1.0, 1.0, math.sqrt(2)),
    (1.0, -1.0, math.sqrt(2)),
    (-1.0, 1.0, math.sqrt(2)),
    (-1.0, -1.0, math.sqrt(2)),
]

# Cost function weights (configurable). Sum is used for normalization in "Balanced".
DEFAULT_WEIGHTS = {
    "distance": 0.30,
    "safety": 0.30,
    "fuel": 0.20,
    "weather": 0.10,
    "iceberg": 0.10,
}

PRIORITY_MODES = {
    "safety": {
        "distance": 0.15,
        "safety": 0.45,
        "fuel": 0.10,
        "weather": 0.15,
        "iceberg": 0.15,
    },
    "fuel": {
        "distance": 0.25,
        "safety": 0.15,
        "fuel": 0.35,
        "weather": 0.10,
        "iceberg": 0.15,
    },
    "speed": {
        "distance": 0.55,
        "safety": 0.10,
        "fuel": 0.15,
        "weather": 0.10,
        "iceberg": 0.10,
    },
    "balanced": DEFAULT_WEIGHTS,
}


@dataclass
class GridCell:
    lat: float
    lon: float
    ice_concentration: float = 0.0
    iceberg_risk: float = 0.0  # 0..1, proximity-based
    weather_risk: float = 0.0  # 0..1
    wave_risk: float = 0.0
    current_assist: float = 0.0  # -1..1, favorable positive
    land: bool = False
    total_cost: float = 0.0
    distance_cost: float = 0.0
    fuel_cost: float = 0.0


@dataclass
class RouteSegment:
    lat: float
    lon: float
    distance_nm: float
    ice_concentration: float
    iceberg_risk: float
    weather_risk: float
    wave_risk: float
    current_assist: float
    fuel_cost_estimate: float
    total_cost: float


@dataclass
class Route:
    name: str
    waypoints: List[Dict[str, Any]]  # {lat, lon, ...segment fields}
    distance_nm: float
    distance_km: float
    estimated_hours: float
    estimated_fuel_l: float
    risk_score: float
    risk_label: str
    cost: float
    explainability: Dict[str, Any] = field(default_factory=dict)


class RiskLabel(str, Enum):
    VERY_LOW = "VERY LOW"
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


def risk_label(score: float) -> str:
    if score < 20:
        return RiskLabel.VERY_LOW.value
    if score < 40:
        return RiskLabel.LOW.value
    if score < 60:
        return RiskLabel.MODERATE.value
    if score < 80:
        return RiskLabel.HIGH.value
    return RiskLabel.CRITICAL.value


class NavigationGrid:
    """Build and query a cost grid for a bounding region."""

    def __init__(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        step_deg: float = DEFAULT_GRID_STEP_DEG,
    ):
        self.lat_min = lat_min
        self.lat_max = lat_max
        self.lon_min = lon_min
        self.lon_max = lon_max
        self.step = step_deg
        self.cells: Dict[Tuple[int, int], GridCell] = {}
        self._lat_idx: Dict[float, int] = {}
        self._lon_idx: Dict[float, int] = {}
        self.land_mask: set = set()  # (i, j) of land cells

    def _ilat(self, lat: float) -> int:
        return round((lat - self.lat_min) / self.step)

    def _ilon(self, lon: float) -> int:
        return round((lon - self.lon_min) / self.step)

    def _latlon(self, i: int, j: int) -> Tuple[float, float]:
        lat = self.lat_min + i * self.step
        lon = self.lon_min + j * self.step
        # keep lon in [-180, 180]
        lon = (lon + 180.0) % 360.0 - 180.0
        return lat, lon

    def _in_bounds(self, i: int, j: int) -> bool:
        lat, lon = self._latlon(i, j)
        return (self.lat_min <= lat <= self.lat_max) and (self.lon_min <= lon <= self.lon_max)

    def is_land(self, lat: float, lon: float) -> bool:
        # Antarctica continent mask, approximate: land south of ~66S near the pole,
        # with a rough continent outline.
        # Simple mask: treat as land if latitude is below -66S AND within a rough
        # polygon of the continent. For demo, use a circle-ish approximation.
        # Outside the continent, treat as ocean (False).
        if lat > -60.0:
            return False
        # Approximate continent: a rough ellipse around the pole.
        # Center ~ (-75, 0), rx ~ 22 deg lon (depends on lat), ry ~ 10 deg lat
        cx, cy = -75.0, -70.0
        # longitude width shrinks with latitude (toward pole)
        rlon = 22.0 * math.cos(math.radians(abs(lat)))
        dx = (lon - cx) / max(rlon, 1.0)
        dy = (lat - cy) / 10.0
        # land if inside ellipse, except a "warm" ocean corridor for demo route feasibility
        inside = (dx * dx + dy * dy) < 1.0
        # carve a few passable corridors near common research routes
        # (e.g., along the Antarctic Peninsula / Weddell Sea edges)
        # For simplicity, keep land detection but ensure start/dest can be ocean.
        return inside

    def build(
        self,
        ice_grid: List[Dict[str, Any]],
        icebergs: List[Dict[str, Any]],
        ice_predictions: Dict[str, List[Dict[str, Any]]],
        weather_map: Dict[Tuple[float, float], Dict[str, Any]],
        ocean_map: Dict[Tuple[float, float], Dict[str, Any]],
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
    ):
        """Populate grid cells from data sources with interpolation onto the routing grid.

        The synthetic data sources use a coarse grid (e.g. 2°×5°). We project each
        data point onto the routing grid using nearest-neighbour interpolation so that
        different weight configurations actually produce different paths.
        """
        import math as _math

        # Build lookup helpers ---------------------------------------------------
        def _nearest_weather(lat: float, lon: float) -> Dict[str, Any] | None:
            if not weather_map:
                return None
            best = None
            best_d = float("inf")
            for (wl, wllo), w in weather_map.items():
                d = _math.hypot(lat - wl, lon - wllo)
                if d < best_d:
                    best_d = d
                    best = w
            return best

        def _nearest_ocean(lat: float, lon: float) -> Dict[str, Any] | None:
            if not ocean_map:
                return None
            best = None
            best_d = float("inf")
            for (olat, olon), o in ocean_map.items():
                d = _math.hypot(lat - olat, lon - olon)
                if d < best_d:
                    best_d = d
                    best = o
            return best

        def _nearest_ice(lat: float, lon: float) -> float:
            """Nearest-neighbour lookup into the ice grid.

            The ice_grid passed to build() may be either a list of SeaIcePoint
            dataclasses (from synthetic_data) or a list of plain dicts (from
            CSV upload / API responses). Handle both.
            """
            best = 0.0
            best_d = float("inf")
            get_lat = getattr(p, "lat", None) if False else None  # placeholder
            for p in ice_grid:
                if hasattr(p, "lat"):
                    pl, pn, pc = p.lat, p.lon, p.concentration
                else:
                    pl, pn, pc = p["lat"], p["lon"], p["concentration"]
                d = _math.hypot(lat - pl, lon - pn)
                if d < best_d:
                    best_d = d
                    best = pc
            return best

        self.cells = {}
        ni = self._ilat(self.lat_max)
        nj = self._ilon(self.lon_max)
        for i in range(self._ilat(self.lat_min), ni + 1):
            for j in range(self._ilon(self.lon_min), nj + 1):
                if not self._in_bounds(i, j):
                    continue
                lat, lon = self._latlon(i, j)
                land = self.is_land(lat, lon)
                cell = GridCell(lat=lat, lon=lon, land=land)

                # Ice concentration — interpolated from coarse ice grid,
                # with corridor-specific hazard overlay for demo scenarios.
                cell.ice_concentration = _nearest_ice(lat, lon)
                # Apply corridor ice patches (demo scenario: (-68,0) -> (-72,10))
                for clat, clon, r, add in (
                    (-70.5, 3.0, 1.2, 60.0),
                    (-71.5, 6.0, 0.8, 45.0),
                    (-69.0, -1.0, 1.0, 50.0),
                ):
                    d = _math.hypot(lat - clat, lon - clon)
                    if d < r:
                        factor = 1.0 - (d / r)
                        cell.ice_concentration = min(100.0,
                            cell.ice_concentration + add * (factor * factor))

                # Iceberg proximity risk (current + predicted)
                ice_risk = 0.0
                for ib in icebergs:
                    d = distance_nm(lat, lon, ib["lat"], ib["lon"])
                    if d < 100.0:
                        ice_risk = max(ice_risk, 1.0 - d / 100.0)
                for iid, preds in ice_predictions.items():
                    for p in preds:
                        d = distance_nm(lat, lon, p["lat"], p["lon"])
                        if d < 100.0:
                            ice_risk = max(ice_risk, 0.6 * (1.0 - d / 100.0))
                cell.iceberg_risk = min(1.0, ice_risk)

                # Weather / wave risk — interpolated from coarse weather grid,
                # with corridor storm-cell overlay for demo scenarios.
                w = _nearest_weather(lat, lon)
                if w:
                    storm = w.get("storm", False)
                    wind = w.get("wind_kmh", 20.0)
                    wave = w.get("wave_height_m", 2.0)
                    # Corridor storm cells: (-71, 5) and (-69.5, -3)
                    for slat, slon, r, wadd, wavedd in (
                        (-71.0, 5.0, 1.0, 28.0, 2.2),
                        (-69.5, -3.0, 0.8, 20.0, 1.5),
                    ):
                        d = _math.hypot(lat - slat, lon - slon)
                        if d < r:
                            factor = 1.0 - (d / r)
                            wind = wind + wadd * (factor * factor)
                            wave = wave + wavedd * (factor * factor)
                            if wind > 45.0 or wave > 3.8:
                                storm = True
                    cell.weather_risk = min(1.0, (wind / 60.0) + (1.0 if storm else 0.0))
                    cell.wave_risk = min(1.0, wave / 5.0)
                else:
                    cell.weather_risk = 0.2
                    cell.wave_risk = 0.2

                # Current assist — interpolated from coarse ocean grid,
                # with corridor current-jet overlay for demo scenarios.
                o = _nearest_ocean(lat, lon)
                if o:
                    cs = o.get("current_speed_ms", 0.0)
                    cd = o.get("current_dir_deg", 90.0)
                    # Corridor current jets: (-69, 8) and (-70, 12)
                    for jlat, jlon, r, sadd, sdir in (
                        (-69.0, 8.0, 1.2, 0.45, 215.0),
                        (-70.0, 12.0, 1.0, 0.30, 220.0),
                    ):
                        d = _math.hypot(lat - jlat, lon - jlon)
                        if d < r:
                            factor = 1.0 - (d / r)
                            cs = cs + sadd * (factor * factor)
                            if factor > 0.3:
                                cd_rad = _math.radians(cd)
                                jd_rad = _math.radians(sdir)
                                wgt = factor
                                new_rad = _math.atan2(
                                    _math.sin(cd_rad) * (1 - wgt) + _math.sin(jd_rad) * wgt,
                                    _math.cos(cd_rad) * (1 - wgt) + _math.cos(jd_rad) * wgt,
                                )
                                cd = _math.degrees(new_rad) % 360.0
                    brng = _math.degrees(
                        _math.atan2(
                            _math.sin(_math.radians(lon - dest_lon)) * _math.cos(_math.radians(dest_lat)),
                            _math.cos(_math.radians(lat)) * _math.sin(_math.radians(dest_lat))
                            - _math.sin(_math.radians(lat)) * _math.cos(_math.radians(dest_lat))
                            * _math.cos(_math.radians(lon - dest_lon)),
                        )
                    )
                    brng = (brng + 360.0) % 360.0
                    cd_rad = _math.radians(cd)
                    br_rad = _math.radians(brng)
                    assist = cs * _math.cos(cd_rad - br_rad) / 1.0
                    cell.current_assist = min(1.0, max(-1.0, assist))
                else:
                    cell.current_assist = 0.0

                self.cells[(i, j)] = cell

        # Inject corridor-specific hazards so that different weight configs
        # (shortest / recommended / safest) produce genuinely different routes.
        from app.routing.corridor_hazards import inject_corridor_hazards
        inject_corridor_hazards(
            self.cells, icebergs, ice_predictions, weather_map, ocean_map,
            dest_lat, dest_lon,
        )

        # Mark start/dest cells as ocean for route feasibility
        si, sj = self._ilat(start_lat), self._ilon(start_lon)
        di, dj = self._ilat(dest_lat), self._ilon(dest_lon)
        if (si, sj) in self.cells:
            self.cells[(si, sj)].land = False
        if (di, dj) in self.cells:
            self.cells[(di, dj)].land = False

    def _neighbors(self, i: int, j: int) -> List[Tuple[int, int, float]]:
        out = []
        for di, dj, cost in MOVES:
            ni, nj = i + di, j + dj
            if (ni, nj) in self.cells and not self.cells[(ni, nj)].land:
                out.append((ni, nj, cost))
        return out

    def _heuristic(self, i: int, j: int, dest_i: int, dest_j: int) -> float:
        """Euclidean heuristic in deg-space, scaled by step."""
        dl = (i - dest_i) * self.step
        dl2 = (j - dest_j) * self.step
        return math.sqrt(dl * dl + dl2 * dl2) * 111.0  # rough km

    def _build_path(
        self, came_from: Dict[Tuple[int, int], Tuple[int, int]], current: Tuple[int, int]
    ) -> List[Tuple[int, int]]:
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    def _cell_to_segment(self, cell: GridCell, prev_dist: float) -> Dict[str, Any]:
        return {
            "lat": cell.lat,
            "lon": cell.lon,
            "distance_nm": 0.0,  # filled later
            "ice_concentration": cell.ice_concentration,
            "iceberg_risk": cell.iceberg_risk,
            "weather_risk": cell.weather_risk,
            "wave_risk": cell.wave_risk,
            "current_assist": cell.current_assist,
            "fuel_cost_estimate": 0.0,  # filled later
            "total_cost": cell.total_cost,
        }

    def search(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        caller: str = "astar",
        weights: Optional[Dict[str, float]] = None,
    ) -> Optional[Route]:
        """Run A* (default) or Dijkstra and return a Route."""
        weights = weights or DEFAULT_WEIGHTS
        si, sj = self._ilat(start_lat), self._ilon(start_lon)
        di, dj = self._ilat(dest_lat), self._ilon(dest_lon)
        if (si, sj) not in self.cells or (di, dj) not in self.cells:
            return None
        if caller == "dijkstra":
            path = self._dijkstra(si, sj, di, dj, weights)
        else:
            path = self._astar(si, sj, di, dj, weights)
        if path is None:
            return None
        return self._route_from_path(path, start_lat, start_lon, dest_lat, dest_lon, weights)

    def _astar(
        self,
        si: int,
        sj: int,
        di: int,
        dj: int,
        weights: Dict[str, float],
    ) -> Optional[List[Tuple[int, int]]]:
        open_set: List[Tuple[float, int, int]] = []
        start_f = self._heuristic(si, sj, di, dj)
        heapq.heappush(open_set, (start_f, si, sj))
        g_score: Dict[Tuple[int, int], float] = {(si, sj): 0.0}
        came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}
        closed: set = set()

        while open_set:
            f, i, j = heapq.heappop(open_set)
            if (i, j) in closed:
                continue
            closed.add((i, j))
            if (i, j) == (di, dj):
                return self._build_path(came_from, (i, j))
            for ni, nj, move_cost in self._neighbors(i, j):
                if (ni, nj) in closed:
                    continue
                cell = self.cells[(ni, nj)]
                # composite step cost = weighted distance + weighted risk surcharges
                step_cost = self._step_cost(cell, weights)
                tentative = g_score[(i, j)] + step_cost * move_cost
                if tentative < g_score.get((ni, nj), float("inf")):
                    g_score[(ni, nj)] = tentative
                    f_score = tentative + self._heuristic(ni, nj, di, dj)
                    heapq.heappush(open_set, (f_score, ni, nj))
                    came_from[(ni, nj)] = (i, j)
        return None

    def _dijkstra(
        self,
        si: int,
        sj: int,
        di: int,
        dj: int,
        weights: Dict[str, float],
    ) -> Optional[List[Tuple[int, int]]]:
        dist: Dict[Tuple[int, int], float] = {(si, sj): 0.0}
        prev: Dict[Tuple[int, int], Tuple[int, int]] = {}
        pq: List[Tuple[float, int, int]] = [(0.0, si, sj)]
        closed: set = set()
        while pq:
            d, i, j = heapq.heappop(pq)
            if (i, j) in closed:
                continue
            closed.add((i, j))
            if (i, j) == (di, dj):
                return self._build_path(prev, (i, j))
            for ni, nj, move_cost in self._neighbors(i, j):
                if (ni, nj) in closed:
                    continue
                cell = self.cells[(ni, nj)]
                step_cost = self._step_cost(cell, weights)
                nd = d + weights["distance"] * move_cost + step_cost * move_cost
                if nd < dist.get((ni, nj), float("inf")):
                    dist[(ni, nj)] = nd
                    prev[(ni, nj)] = (i, j)
                    heapq.heappush(pq, (nd, ni, nj))
        return None

    def _step_cost(self, cell: GridCell, weights: Dict[str, float]) -> float:
        """Per-cell traversal cost multiplier.

        Returns ``(1.0 + hazard_factor * risk_weight)`` where:

        * ``hazard_factor`` captures the cell's ice/iceberg/weather/wave/current hazards
          (0 = clean, up to ~1.5 = very hazardous).
        * ``risk_weight`` is derived from the active config's distance weight — higher for
          safety (strong hazard aversion), lower for speed (tolerant of hazards).

        The caller multiplies by ``move_cost`` (1.0 cardinal, sqrt(2) diagonal), so the
        final step cost = multiplier * move_cost.

        This makes safety configs detours around hazards while speed configs cut through.
        """
        ice = cell.ice_concentration / 100.0          # 0..1
        ice_risk = cell.iceberg_risk                   # 0..1
        wx = max(0.0, cell.weather_risk)               # 0..1
        wave = max(0.0, cell.wave_risk)                # 0..1
        cur = cell.current_assist                      # -1..1

        # ---- hazard factor (0 = clean, up to ~1.5 = very hazardous) ----
        ice_factor      = ice * 0.50
        iceberg_factor  = ice_risk * 0.30
        wx_factor       = wx * 0.15
        wave_factor     = wave * 0.10
        unfavorable_current = max(0.0, -cur) * 0.10

        hazard_factor = (
            ice_factor + iceberg_factor + wx_factor + wave_factor + unfavorable_current
        )
        hazard_factor = min(1.5, max(0.0, hazard_factor))

        # ---- risk weight from distance weight (config-dependent) ----
        w_dist = weights.get("distance", 0.30)
        w_dist = max(0.08, min(0.60, w_dist))
        # speed (0.55):  (0.55/0.55)^2 = 1.0   ← hazards matter little
        # balanced (0.30): (0.55/0.30)^2 = 3.36 ← moderate aversion
        # safety (0.15):  (0.55/0.15)^2 = 13.4  ← strong aversion
        risk_weight = (0.55 / w_dist) ** 2

        # ---- total multiplier ----
        return 1.0 + hazard_factor * risk_weight

    def _route_from_path(
        self,
        path: List[Tuple[int, int]],
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        weights: Dict[str, float],
    ) -> Route:
        # Build segments
        segs: List[Dict[str, Any]] = []
        total_nm = 0.0
        prev_lat, prev_lon = start_lat, start_lon
        for (i, j) in path:
            cell = self.cells[(i, j)]
            d_nm = distance_nm(prev_lat, prev_lon, cell.lat, cell.lon)
            total_nm += d_nm
            seg = {
                "lat": cell.lat,
                "lon": cell.lon,
                "distance_nm": round(d_nm, 2),
                "ice_concentration": round(cell.ice_concentration, 1),
                "iceberg_risk": round(cell.iceberg_risk, 3),
                "weather_risk": round(cell.weather_risk, 3),
                "wave_risk": round(cell.wave_risk, 3),
                "current_assist": round(cell.current_assist, 3),
            }
            segs.append(seg)
            prev_lat, prev_lon = cell.lat, cell.lon

        # Average ice along route
        avg_ice = sum(s["ice_concentration"] for s in segs) / max(1, len(segs))
        avg_iceberg = sum(s["iceberg_risk"] for s in segs) / max(1, len(segs))
        avg_weather = sum(s["weather_risk"] for s in segs) / max(1, len(segs))
        avg_wave = sum(s["wave_risk"] for s in segs) / max(1, len(segs))
        avg_current = sum(s["current_assist"] for s in segs) / max(1, len(segs))

        # Fuel estimate (placeholder; properly computed by fuel model in app layer)
        # We'll fill fuel in the app layer using vessel config.
        km = total_nm * 1.852
        risk_comp = (avg_ice / 100.0) * 30 + (avg_iceberg) * 30 + (avg_weather) * 20 + (avg_wave) * 10 + (abs(avg_current) * 10)
        risk_score = min(100.0, max(0.0, risk_comp))

        return Route(
            name="",
            waypoints=segs,
            distance_nm=round(total_nm, 1),
            distance_km=round(km, 1),
            estimated_hours=0.0,
            estimated_fuel_l=0.0,
            risk_score=round(risk_score, 1),
            risk_label=risk_label(risk_score),
            cost=0.0,
            explainability={
                "avg_ice_concentration": round(avg_ice, 1),
                "avg_iceberg_risk": round(avg_iceberg, 3),
                "avg_weather_risk": round(avg_weather, 3),
                "avg_wave_risk": round(avg_wave, 3),
                "avg_current_assist": round(avg_current, 3),
            },
        )


def generate_alternative_routes(
    grid: NavigationGrid,
    start_lat: float,
    start_lon: float,
    dest_lat: float,
    dest_lon: float,
    vessel: Dict[str, Any],
    mode_weights: Dict[str, float] | None = None,
) -> List[Route]:
    """Generate Shortest / Recommended / Safest routes.

    Each uses A* with different weight configurations. Fuel and time are filled
    by the app-layer fuel/time model after route construction.
    """
    w_safe = PRIORITY_MODES["safety"]
    w_fuel = PRIORITY_MODES["fuel"]
    w_balanced = PRIORITY_MODES["balanced"]
    w_speed = PRIORITY_MODES["speed"]

    routes = []
    # Shortest: tilt heavily to distance
    r_short = grid.search(start_lat, start_lon, dest_lat, dest_lon, "astar", w_speed)
    if r_short:
        r_short.name = "Shortest"
        routes.append(r_short)
    # Safest
    r_safe = grid.search(start_lat, start_lon, dest_lat, dest_lon, "astar", w_safe)
    if r_safe:
        r_safe.name = "Safest"
        routes.append(r_safe)
    # Recommended (Balanced)
    r_bal = grid.search(start_lat, start_lon, dest_lat, dest_lon, "astar", w_balanced)
    if r_bal:
        r_bal.name = "Recommended"
        routes.append(r_bal)

    # If any route missing, try Dijkstra as fallback
    if not routes:
        for w, nm in [(w_speed, "Shortest"), (w_balanced, "Recommended"), (w_safe, "Safest")]:
            rd = grid.search(start_lat, start_lon, dest_lat, dest_lon, "dijkstra", w)
            if rd:
                rd.name = nm
                routes.append(rd)
    return routes
