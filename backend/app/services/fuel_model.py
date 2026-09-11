# -*- coding: utf-8 -*-
"""Prototype fuel consumption model.

Fuel estimate = base + ice penalty + current penalty + wave penalty +
                weather penalty, scaled by vessel configuration.

Clearly labelled as a prototype estimation model — not validated against
real vessel engineering data.
"""

from __future__ import annotations

import math
from typing import Any, Dict


def fuel_estimate(
    route: Dict[str, Any],
    vessel: Dict[str, Any],
    dt,
) -> Dict[str, Any]:
    """Return fuel breakdown for a route given vessel config.

    vessel keys: max_speed_knots, fuel_capacity_l, consumption_l_per_nm,
                 ice_class (e.g. "Ice-capable"), name.
    route keys: distance_nm, avg ice/iceberg/weather/wave/current (via explainability).
    """
    distance_nm = float(route.get("distance_nm", 0.0))
    expl = route.get("explainability", {})
    avg_ice = float(expl.get("avg_ice_concentration", 0.0))
    avg_wave = float(expl.get("avg_wave_risk", 0.0))  # 0..1
    avg_current = float(expl.get("avg_current_assist", 0.0))  # -1..1, positive=favorable
    avg_weather = float(expl.get("avg_weather_risk", 0.0))  # 0..1
    avg_iceberg = float(expl.get("avg_iceberg_risk", 0.0))

    max_speed = float(vessel.get("max_speed_knots", 14.0))
    # effective speed reduced by ice
    ice_speed_penalty = math.sqrt(max(0.0, avg_ice / 100.0)) * 0.3
    effective_speed = max(4.0, max_speed * (1.0 - ice_speed_penalty))

    # hours
    hours = distance_nm / effective_speed if effective_speed > 0 else 0.0

    # base consumption per nm at calm, no ice, favorable current
    base_l_per_nm = float(vessel.get("consumption_l_per_nm", 25.0))
    base_fuel = distance_nm * base_l_per_nm

    # ice penalty: heavier ice => more fuel per nm
    ice_penalty_per_nm = base_l_per_nm * (avg_ice / 100.0) * 0.6
    ice_penalty = distance_nm * ice_penalty_per_nm

    # current penalty/benefit: opposing current increases fuel; favorable reduces
    current_effect_per_nm = -base_l_per_nm * avg_current * 0.4
    current_penalty = distance_nm * current_effect_per_nm

    # wave penalty
    wave_penalty_per_nm = base_l_per_nm * avg_wave * 0.5
    wave_penalty = distance_nm * wave_penalty_per_nm

    # weather penalty (wind/storm)
    weather_penalty_per_nm = base_l_per_nm * avg_weather * 0.3
    weather_penalty = distance_nm * weather_penalty_per_nm

    total = base_fuel + ice_penalty + current_penalty + wave_penalty + weather_penalty
    total = max(0.0, total)

    return {
        "distance_nm": round(distance_nm, 1),
        "effective_speed_knots": round(effective_speed, 2),
        "estimated_hours": round(hours, 1),
        "base_fuel_l": round(base_fuel, 1),
        "ice_penalty_l": round(ice_penalty, 1),
        "current_penalty_l": round(current_penalty, 1),
        "wave_penalty_l": round(wave_penalty, 1),
        "weather_penalty_l": round(weather_penalty, 1),
        "total_fuel_l": round(total, 1),
        "note": "Prototype estimation model, not validated against real vessel engineering data.",
    }


def fuel_for_route(route: Dict[str, Any], vessel: Dict[str, Any]) -> Dict[str, Any]:
    return fuel_estimate(route, vessel, None)


def estimate_time_hours(route: Dict[str, Any], vessel: Dict[str, Any]) -> float:
    d = float(route.get("distance_nm", 0.0))
    expl = route.get("explainability", {})
    avg_ice = float(expl.get("avg_ice_concentration", 0.0))
    ice_penalty = math.sqrt(max(0.0, avg_ice / 100.0)) * 0.3
    eff = max(4.0, float(vessel.get("max_speed_knots", 14.0)) * (1.0 - ice_penalty))
    return round(d / eff, 1) if eff > 0 else 0.0
