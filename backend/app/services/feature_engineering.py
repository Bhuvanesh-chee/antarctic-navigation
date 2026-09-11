# -*- coding: utf-8 -*-
"""Feature engineering for sea-ice and iceberg models."""

from __future__ import annotations

import math
from datetime import datetime

from app.services.synthetic_data import haversin_nm


def day_of_year(dt: datetime) -> float:
    return float(dt.timetuple().tm_yday)


def seasonal_phase(dt: datetime) -> float:
    """SH ice seasonal phase: peak around day 240 (Sept)."""
    return math.cos(2 * math.pi * (dt.timetuple().tm_yday - 240) / 365.0)


def lat_abs(lat: float) -> float:
    return abs(lat)


def wind_components(wind_kmh: float, wind_dir_deg: float):
    """Return (u, v) in km/h, meteorological convention: dir FROM which wind blows."""
    rad = math.radians(wind_dir_deg + 180.0)
    u = wind_kmh * math.cos(rad)
    v = wind_kmh * math.sin(rad)
    return u, v


def current_components(current_speed_ms: float, current_dir_deg: float):
    """Return (u, v) in m/s, dir TO which current flows."""
    rad = math.radians(current_dir_deg)
    u = current_speed_ms * math.cos(rad)
    v = current_speed_ms * math.sin(rad)
    return u, v


def bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point1 -> point2, degrees clockwise from North."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlon)
    brng = math.degrees(math.atan2(y, x))
    return (brng + 360.0) % 360.0


def distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversin_nm(lat1, lon1, lat2, lon2)
