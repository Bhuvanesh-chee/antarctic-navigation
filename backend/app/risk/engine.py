# -*- coding: utf-8 -*-
"""Navigation risk engine.

Computes a composite risk score (0-100) from:
- Ice risk (sea-ice concentration along route / at point)
- Iceberg risk (proximity + predicted trajectory intersection)
- Weather risk (wind, storm, visibility)
- Wave risk (wave height)
- Ocean/current risk (adverse current, but primarily a cost in routing)
- Geographic risk (latitude/season, distance from support)

Risk bands:
  0-20   VERY LOW
  20-40  LOW
  40-60  MODERATE
  60-80  HIGH
  80-100 CRITICAL
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.routing.route_optimizer import Route, risk_label


def ice_risk_from_concentration(c: float) -> float:
    """Map concentration (0-100) to a 0-100 risk contribution."""
    if c <= 20:
        return 5.0
    if c <= 50:
        return 20.0
    if c <= 75:
        return 50.0
    return 80.0


def iceberg_risk_score(
    iceberg_risk: float,
    size: str = "Medium",
    vessel_speed_knots: float = 10.0,
    distance_km: float = 10.0,
) -> float:
    """Iceberg collision risk contribution (0-100)."""
    size_factor = {"Small": 0.5, "Medium": 1.0, "Large": 1.5, "Very Large": 2.0}.get(size, 1.0)
    prox = max(0.0, 1.0 - distance_km / 50.0)
    speed_factor = min(1.0, vessel_speed_knots / 14.0)
    return min(100.0, prox * 60.0 * size_factor * speed_factor + iceberg_risk * 20.0)


def weather_risk_score(
    wind_kmh: float,
    storm: bool = False,
    visibility_km: float = 20.0,
    temperature_c: float = -10.0,
) -> float:
    wind_risk = min(100.0, (wind_kmh / 80.0) * 60.0)
    storm_bonus = 25.0 if storm else 0.0
    vis_risk = max(0.0, (1.0 - visibility_km / 25.0)) * 20.0
    temp_risk = max(0.0, ((-25.0 - temperature_c) / 25.0)) * 10.0 if temperature_c < -25.0 else 0.0
    return min(100.0, wind_risk + storm_bonus + vis_risk + temp_risk)


def wave_risk_score(wave_height_m: float) -> float:
    return min(100.0, (wave_height_m / 6.0) * 60.0)


def ocean_risk_score(
    current_speed_ms: float,
    current_dir_deg: float,
    route_bearing_deg: float,
) -> float:
    """Adverse current opposing progress adds risk/cost (0-100)."""
    import math
    cd_rad = math.radians(current_dir_deg)
    br_rad = math.radians(route_bearing_deg)
    # head-current component (positive = opposing)
    head_current = current_speed_ms * math.cos(cd_rad - br_rad)
    if head_current < 0:
        head_current = 0.0
    return min(100.0, head_current / 1.0 * 40.0)


def geographic_risk_score(lat: float, season_factor: float = 1.0) -> float:
    """Higher latitude and worse season => more risk."""
    lat_factor = (abs(lat) - 60.0) / 20.0
    return min(100.0, lat_factor * 30.0 * season_factor)


def composite_route_risk(route: Route) -> Dict[str, Any]:
    """Derive a unified risk score from a route's averaged segment properties."""
    s = route.waypoints
    if not s:
        return {"score": 0.0, "label": "VERY LOW", "components": {}}

    avg_ice = sum(p["ice_concentration"] for p in s) / len(s)
    avg_iceberg = sum(p["iceberg_risk"] for p in s) / len(s)
    avg_weather = sum(p["weather_risk"] for p in s) / len(s)
    avg_wave = sum(p["wave_risk"] for p in s) / len(s)
    avg_current = sum(p["current_assist"] for p in s) / len(s)

    ice = ice_risk_from_concentration(avg_ice)
    iceberg = min(100.0, avg_iceberg * 100.0)
    weather = avg_weather * 100.0
    wave = avg_wave * 100.0
    ocean = max(0.0, -avg_current) * 100.0  # opposing current
    geo = geographic_risk_score(s[0]["lat"])

    components = {
        "ice": round(ice, 1),
        "iceberg": round(iceberg, 1),
        "weather": round(weather, 1),
        "wave": round(wave, 1),
        "ocean_current": round(ocean, 1),
        "geographic": round(geo, 1),
    }
    raw = ice + iceberg + weather + wave + ocean + geo
    # Normalize to 0-100 by soft cap
    score = min(100.0, max(0.0, raw / 2.0))
    return {
        "score": round(score, 1),
        "label": risk_label(score),
        "components": components,
    }


def composite_point_risk(
    lat: float,
    lon: float,
    ice_concentration: float,
    iceberg_proximity_km: float,
    wind_kmh: float,
    storm: bool,
    visibility_km: float,
    temperature_c: float,
    wave_height_m: float,
    current_speed_ms: float,
    current_dir_deg: float,
    route_bearing_deg: float,
) -> Dict[str, Any]:
    ice = ice_risk_from_concentration(ice_concentration)
    iceberg = iceberg_risk_score(iceberg_proximity_km, distance_km=iceberg_proximity_km)
    weather = weather_risk_score(wind_kmh, storm, visibility_km, temperature_c)
    wave = wave_risk_score(wave_height_m)
    ocean = ocean_risk_score(current_speed_ms, current_dir_deg, route_bearing_deg)
    geo = geographic_risk_score(lat)
    components = {
        "ice": round(ice, 1),
        "iceberg": round(iceberg, 1),
        "weather": round(weather, 1),
        "wave": round(wave, 1),
        "ocean_current": round(ocean, 1),
        "geographic": round(geo, 1),
    }
    raw = ice + iceberg + weather + wave + ocean + geo
    score = min(100.0, max(0.0, raw / 2.0))
    return {"score": round(score, 1), "label": risk_label(score), "components": components}
