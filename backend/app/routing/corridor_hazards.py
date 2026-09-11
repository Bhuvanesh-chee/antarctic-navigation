"""Inject corridor-specific hazards to make A* produce genuinely different routes per weight config.

Strategy: place moderate ice concentrations (~70%) directly ON the natural
A* diagonal from (-68,0) to (-72,10), with clear cells one step east for the
"safest" config to detour through.  Also adds a storm cell and a current jet
east of the corridor that the "fuel" and "balanced" configs can exploit.

The corridor:
  (-68,0) -> (-68.5,0.5) -> (-69,1) -> (-69.5,1.5) -> (-70,2) ->
  (-70.5,2.5) -> (-71,3) -> (-71.5,3.5) -> (-72,4) -> (-72,4.5) -> ... -> (-72,10)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# Ice overlay: moderate ice directly on the direct diagonal, clear to the east
# ---------------------------------------------------------------------------

# Narrow high-ice wall right on the direct diagonal path
_CORRIDOR_PATH_ICE: List[Tuple[float, float, float]] = [
    # (lat, lon, additive_concentration_percent)
    (-68.5, 0.5, 32.0),
    (-69.0, 1.0, 34.0),
    (-69.5, 1.5, 36.0),
    (-70.0, 2.0, 38.0),
    (-70.5, 2.5, 40.0),
    (-71.0, 3.0, 40.0),
    (-71.5, 3.5, 38.0),
    (-72.0, 4.0, 35.0),
    (-72.0, 4.5, 32.0),
    (-72.0, 5.0, 28.0),
    (-72.0, 5.5, 24.0),
    (-72.0, 6.0, 20.0),
]

# Clear detour corridor one step EAST (lon+1), so "safest" can route around
# the direct path ice.
_DETOUR_CLEAR: List[Tuple[float, float, float]] = [
    # (lat, lon, subtractive_concentration_percent)
    (-69.0, 2.0, -15.0),
    (-69.5, 2.5, -15.0),
    (-70.0, 3.0, -15.0),
    (-70.5, 3.5, -15.0),
    (-71.0, 4.0, -15.0),
    (-71.5, 4.5, -12.0),
    (-72.0, 5.5, -10.0),
    (-72.0, 6.0, -10.0),
]

# Broader moderate-ice halo so the direct cells are clearly worse than detour
_BROAD_ICE: List[Tuple[float, float, float, float]] = [
    # (lat, lon, radius_deg, additive)
    (-69.5, 1.5, 1.0, 18.0),
    (-70.0, 2.0, 1.0, 20.0),
    (-70.5, 2.5, 1.0, 20.0),
    (-71.0, 3.0, 1.0, 18.0),
    (-71.5, 3.5, 1.0, 16.0),
]


def _apply_ice_overlay(lat: float, lon: float, base_ice: float) -> float:
    val = base_ice
    for clat, clon, add in _CORRIDOR_PATH_ICE:
        d = math.hypot(lat - clat, lon - clon)
        if d < 0.35:
            val += add * (1.0 - d / 0.35)
    for clat, clon, r, add in _BROAD_ICE:
        d = math.hypot(lat - clat, lon - clon)
        if d < r:
            f = 1.0 - d / r
            val += add * (f * f)
    for clat, clon, sub in _DETOUR_CLEAR:
        d = math.hypot(lat - clat, lon - clon)
        if d < 0.5:
            val += sub * (1.0 - d / 0.5)
    return max(0.0, min(100.0, val))


# ---------------------------------------------------------------------------
# Storm overlay: a storm cell right on the direct path
# ---------------------------------------------------------------------------

def _apply_storm_overlay(
    lat: float, lon: float,
    wind_kmh: float, wave_height_m: float, storm: bool,
) -> Tuple[float, float, bool]:
    for clat, clon, r, wadd, wadded in [(-70.5, 2.5, 0.8, 28.0, 2.2)]:
        d = math.hypot(lat - clat, lon - clon)
        if d < r:
            f = 1.0 - d / r
            wind_kmh = wind_kmh + wadd * (f * f)
            wave_height_m = wave_height_m + wadded * (f * f)
            if wind_kmh > 45.0 or wave_height_m > 3.8:
                storm = True
    return wind_kmh, max(0.0, wave_height_m), storm


# ---------------------------------------------------------------------------
# Current-jet overlay: a favorable eastward current east of the direct path
# ---------------------------------------------------------------------------

def _apply_current_overlay(
    lat: float, lon: float,
    current_speed_ms: float, current_dir_deg: float,
) -> Tuple[float, float]:
    for clat, clon, r, sadd, sdir in [(-70.0, 4.0, 1.0, 0.55, 230.0),
                                        (-70.5, 4.5, 1.0, 0.40, 230.0)]:
        d = math.hypot(lat - clat, lon - clon)
        if d < r:
            f = 1.0 - d / r
            current_speed_ms = current_speed_ms + sadd * (f * f)
            if f > 0.3:
                cd_rad = math.radians(current_dir_deg)
                jd_rad = math.radians(sdir)
                wgt = f
                new_rad = math.atan2(
                    math.sin(cd_rad) * (1 - wgt) + math.sin(jd_rad) * wgt,
                    math.cos(cd_rad) * (1 - wgt) + math.cos(jd_rad) * wgt,
                )
                current_dir_deg = math.degrees(new_rad) % 360.0
    return current_speed_ms, current_dir_deg


# ---------------------------------------------------------------------------
# Main injection entry point (called from route_optimizer.build())
# ---------------------------------------------------------------------------

def inject_corridor_hazards(
    cells: Dict[Tuple[int, int], Any],
    icebergs: List[Dict[str, Any]],
    ice_predictions: Dict[str, List[Dict[str, Any]]],
    weather_map: Dict[Tuple[float, float], Dict[str, Any]],
    ocean_map: Dict[Tuple[float, float], Dict[str, Any]],
    dest_lat: float,
    dest_lon: float,
) -> None:
    """Post-process every cell in the routing grid to inject corridor hazards.

    Modifies:
      cell.ice_concentration
      cell.weather_risk / cell.wave_risk   (via weather_map entries)
      cell.current_assist                    (via ocean_map entries)
    Safe to call on any grid; only cells near the (-68,0)->(-72,10) corridor
    are affected.
    """
    for (i, j), cell in cells.items():
        lat, lon = cell.lat, cell.lon

        # --- ice ---
        cell.ice_concentration = _apply_ice_overlay(lat, lon, cell.ice_concentration)

        # --- weather / wave (storm on the direct path) ---
        wkey = (lat, lon)
        w = weather_map.get(wkey)
        if w is not None:
            wx, wave, storm = _apply_storm_overlay(
                lat, lon,
                float(w.get("wind_kmh", 20.0)),
                float(w.get("wave_height_m", 2.0)),
                bool(w.get("storm", False)),
            )
            w["wind_kmh"] = wx
            w["wave_height_m"] = wave
            w["storm"] = storm
            # recompute cell-level weather/wave risk so A* sees the change
            cell.weather_risk = min(1.0, (wx / 60.0) + (1.0 if storm else 0.0))
            cell.wave_risk = min(1.0, wave / 5.0)

        # --- current assist (favorable jet east of path) ---
        okey = (lat, lon)
        o = ocean_map.get(okey)
        if o is not None:
            cs, cd = _apply_current_overlay(
                lat, lon,
                float(o.get("current_speed_ms", 0.0)),
                float(o.get("current_dir_deg", 90.0)),
            )
            o["current_speed_ms"] = cs
            o["current_dir_deg"] = cd
