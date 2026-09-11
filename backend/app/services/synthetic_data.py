# -*- coding: utf-8 -*-
"""Synthetic Antarctic environmental data generator.

Produces realistic-looking (but clearly labelled DEMO/SYNTHETIC) data:
- Sea-ice grid (lat, lon, concentration, timestamp)
- Iceberg tracks (id, lat, lon, timestamp, speed, direction, size)
- Weather points (wind, temp, pressure, wave, precipitation)
- Ocean points (current speed/direction, sst, salinity, depth)

These are NOT official NCPOR datasets. They exist so the prototype
runs immediately and so real datasets can be swapped in later via CSV.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List

# Antarctic-relevant bounding box (south of 60S, around the continent)
MIN_LAT = -80.0
MAX_LAT = -60.0
MIN_LON = -180.0
MAX_LON = 180.0

random.seed(20240909)

# ---------------------------------------------------------------------------
# Spatially coherent noise helpers — produce smooth fields with real features
# ---------------------------------------------------------------------------

def _smooth_field(lat: float, lon: float, seed: int, amp: float,
                  scales: List[Tuple[float, float, float]]) -> float:
    """Multi-scale product of sines + small noise = smooth coherent field.

    *scales* = list of (lon_wavelength_deg, lat_wavelength_deg, amplitude).
    """
    v = 0.0
    for wl, wla, a in scales:
        v += a * math.sin(math.radians(lon / wl)) * math.sin(math.radians(lat / wla))
    # small per-point noise (seeded) so fields aren't perfectly smooth
    rng = random.Random(seed * 1000 + int(round(lat * 10)) * 100 + int(round(lon)))
    v += rng.gauss(0.0, amp * 0.15)
    return v

def _hotspot(lat: float, lon: float, cx: float, cy: float,
             radius_deg: float, peak: float) -> float:
    """Gaussian hotspot at (cx, cy)."""
    d = math.hypot(lat - cy, lon - cx)
    return peak * math.exp(-(d * d) / (2.0 * radius_deg * radius_deg))


def haversin_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in nautical miles."""
    R = 3440.065  # Earth radius in nautical miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


@dataclass
class SeaIcePoint:
    lat: float
    lon: float
    concentration: float  # 0..100
    timestamp: datetime
    risk: str = ""  # derived

    def __post_init__(self):
        self.risk = classify_ice(self.concentration)


def classify_ice(c: float) -> str:
    if c <= 20:
        return "LOW"
    if c <= 50:
        return "MODERATE"
    if c <= 75:
        return "HIGH"
    return "VERY HIGH"


def generate_ice_concentration(lat: float, lon: float, dt: datetime) -> float:
    """Synthetic sea-ice concentration field with real spatial structure.

    Seasonal cycle + latitude gradient + multi-scale coherent bands +
    localized hotspots (Weddell/Ross-like) + small noise.
    Southern hemisphere: ice max around Sept (day ~240), min around Feb.
    """
    day_of_year = dt.timetuple().tm_yday
    seasonal = 0.5 + 0.5 * math.cos(2 * math.pi * (day_of_year - 240) / 365.0)
    lat_factor = (abs(lat) - 60.0) / (80.0 - 60.0)  # 0 near 60S, 1 near 80S
    base = 10.0 + 60.0 * (0.3 + 0.7 * lat_factor) * seasonal

    # Multi-scale coherent longitudinal/meridional structure
    band = _smooth_field(
        lat, lon, seed=1,
        amp=14.0,
        scales=[
            (60.0, 8.0, 10.0),   # broad east-west bands
            (30.0, 5.0, 6.0),    # medium features
            (15.0, 3.0, 3.0),    # finer texture
        ],
    )

    # Localized ice hotspots (Weddell Sea - around -70lat, -45lon;
    # Ross Sea - around -75lat, 170lon; Amundsen - around -73lat, -140lon)
    hotspots = _hotspot(lat, lon, -45.0, -70.0, 12.0, 22.0) \
             + _hotspot(lat, lon, 170.0, -75.0, 14.0, 20.0) \
             + _hotspot(lat, lon, -140.0, -73.0, 10.0, 16.0) \
             + _hotspot(lat, lon, 30.0, -72.0, 8.0, 12.0)

    noise = random.gauss(0.0, 4.0)
    val = base + band + hotspots + noise
    return clamp(val, 0.0, 100.0)


def generate_sea_ice_grid(
    ts: datetime,
    lat_step: float = 2.0,
    lon_step: float = 5.0,
    bounds: tuple = (MIN_LAT, MAX_LAT, MIN_LON, MAX_LON),
) -> List[SeaIcePoint]:
    lat0, lat1, lon0, lon1 = bounds
    rows = int((lat1 - lat0) / lat_step) + 1
    cols = int((lon1 - lon0) / lon_step) + 1
    points: List[SeaIcePoint] = []
    for i in range(rows):
        lat = round(lat0 + i * lat_step, 3)
        for j in range(cols):
            lon = round(lon0 + j * lon_step, 3)
            c = generate_ice_concentration(lat, lon, ts)
            points.append(SeaIcePoint(lat=lat, lon=lon, concentration=c, timestamp=ts))
    return points


@dataclass
class Iceberg:
    id: str
    lat: float
    lon: float
    timestamp: datetime
    speed_ms: float
    direction_deg: float  # degrees, 0=North, clockwise
    size: str  # Small / Medium / Large / Very Large
    height_m: float | None = None


def iceberg_size_params(size: str) -> dict:
    table = {
        "Small": {"speed_base": 0.3, "height": (5, 15)},
        "Medium": {"speed_base": 0.5, "height": (15, 30)},
        "Large": {"speed_base": 0.7, "height": (30, 50)},
        "Very Large": {"speed_base": 0.9, "height": (50, 80)},
    }
    return table.get(size, table["Medium"])


def generate_icebergs(n: int, ts: datetime) -> List[Iceberg]:
    sizes = ["Small", "Medium", "Large", "Very Large"]
    size_weights = [0.4, 0.35, 0.2, 0.05]
    out: List[Iceberg] = []
    for k in range(n):
        size = random.choices(sizes, weights=size_weights, k=1)[0]
        sp = iceberg_size_params(size)
        lat = round(random.uniform(MIN_LAT, MAX_LAT), 3)
        lon = round(random.uniform(MIN_LON, MAX_LON), 3)
        spd = round(sp["speed_base"] * random.uniform(0.6, 1.4), 3)
        direction = float(random.randint(0, 359))
        h_lo, h_hi = sp["height"]
        height = round(random.uniform(h_lo, h_hi), 1)
        out.append(
            Iceberg(
                id=f"ICE-{100 + k:03d}",
                lat=lat,
                lon=lon,
                timestamp=ts,
                speed_ms=spd,
                direction_deg=direction,
                size=size,
                height_m=height,
            )
        )
    return out


@dataclass
class WeatherPoint:
    lat: float
    lon: float
    timestamp: datetime
    wind_kmh: float
    wind_dir_deg: float
    temperature_c: float
    pressure_mb: float
    visibility_km: float
    precipitation_mm: float
    wave_height_m: float
    wave_dir_deg: float
    storm: bool = False


def generate_weather(lat: float, lon: float, ts: datetime) -> WeatherPoint:
    day_of_year = ts.timetuple().tm_yday
    seasonal_temp = -2.0 + -12.0 * (0.3 + 0.7 * math.sin(math.radians(abs(lat) - 60.0)))
    temp = seasonal_temp + random.gauss(0.0, 2.0)

    # Spatially coherent wind field with embedded storm cells
    wind_base = 18.0 + 8.0 * math.sin(math.radians(lon / 45.0)) + 5.0 * math.sin(math.radians(lat / 6.0))
    wind_structure = _smooth_field(lat, lon, seed=2, amp=10.0,
                                   scales=[(90.0, 10.0, 8.0), (40.0, 5.0, 4.0)])
    wind_kmh = max(0.0, wind_base + wind_structure)

    # Embedded storm cells (localized high-wind/high-wave regions)
    storm_hotspot = _hotspot(lat, lon, -30.0, -68.0, 8.0, 30.0) \
                   + _hotspot(lat, lon, 60.0, -72.0, 6.0, 25.0) \
                   + _hotspot(lat, lon, -120.0, -65.0, 10.0, 35.0)
    wind_kmh = wind_kmh + storm_hotspot

    wind_dir = (90.0 + 40.0 * math.sin(math.radians(lon / 60.0)) + random.gauss(0.0, 15.0)) % 360.0
    pressure = 985.0 + 10.0 * math.sin(math.radians(lon / 50.0)) + random.gauss(0.0, 5.0)
    visibility = max(1.0, 25.0 - storm_hotspot * 0.6 + random.gauss(0.0, 2.0))
    precip = max(0.0, 0.5 + storm_hotspot * 0.15 + abs(random.gauss(0.0, 1.0)))
    wave = max(0.3, 0.5 + 0.25 * (wind_kmh / 30.0) + storm_hotspot * 0.1 + random.gauss(0.0, 0.3))
    wave_dir = (wind_dir + random.uniform(-15, 15)) % 360.0
    storm = wind_kmh > 45.0 or wave > 3.8
    return WeatherPoint(
        lat=lat,
        lon=lon,
        timestamp=ts,
        wind_kmh=round(wind_kmh, 2),
        wind_dir_deg=round(wind_dir, 1),
        temperature_c=round(temp, 2),
        pressure_mb=round(pressure, 1),
        visibility_km=round(visibility, 2),
        precipitation_mm=round(precip, 2),
        wave_height_m=round(max(0.0, wave), 2),
        wave_dir_deg=round(wave_dir % 360, 1),
        storm=storm,
    )


@dataclass
class OceanPoint:
    lat: float
    lon: float
    timestamp: datetime
    current_speed_ms: float
    current_dir_deg: float
    sst_c: float
    salinity_psu: float
    wave_height_m: float
    depth_m: float


def generate_ocean(lat: float, lon: float, ts: datetime) -> OceanPoint:
    day_of_year = ts.timetuple().tm_yday
    sst = -1.8 + 0.5 * math.sin(math.radians(lon / 40.0)) + random.gauss(0.0, 0.3)
    salinity = 34.0 + 0.3 * math.sin(math.radians(lat / 8.0)) + random.gauss(0.0, 0.2)

    # Structured ocean currents: circumpolar current + embedded jets + eddies
    # Eastward bias (CCN) with spatial structure
    base_current = 0.35 + 0.15 * math.sin(math.radians(lon / 50.0))
    current_structure = _smooth_field(lat, lon, seed=3, amp=0.25,
                                      scales=[(70.0, 12.0, 0.15), (35.0, 6.0, 0.10)])
    current_speed = max(0.0, base_current + current_structure)

    # Embedded current jets (localized faster flows)
    jet_hotspot = _hotspot(lat, lon, 20.0, -68.0, 6.0, 0.4) \
                + _hotspot(lat, lon, -80.0, -72.0, 8.0, 0.3) \
                + _hotspot(lat, lon, 100.0, -66.0, 7.0, 0.35)
    current_speed = current_speed + jet_hotspot

    # Current direction varies coherently with longitude
    base_dir = 90.0 + 30.0 * math.sin(math.radians(lon / 60.0))
    current_dir = (base_dir + random.gauss(0.0, 10.0) + 15.0 * math.sin(math.radians(lat / 5.0))) % 360.0

    wave = max(0.3, 0.5 + 0.15 * current_speed + random.gauss(0.0, 0.2))
    depth = 500.0 + 2000.0 * math.exp(-(abs(lat) - 65.0) / 15.0) + random.gauss(0.0, 200.0)
    return OceanPoint(
        lat=lat,
        lon=lon,
        timestamp=ts,
        current_speed_ms=round(current_speed, 3),
        current_dir_deg=round(current_dir % 360, 1),
        sst_c=round(sst, 2),
        salinity_psu=round(salinity, 2),
        wave_height_m=round(max(0.0, wave), 2),
        depth_m=round(max(0.0, depth), 1),
    )


def dt_series(base: datetime, hours: List[int]) -> List[datetime]:
    return [base + timedelta(hours=int(h)) for h in hours]
