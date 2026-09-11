# -*- coding: utf-8 -*-
"""Iceberg trajectory prediction model.

Approach (prototype baseline, clearly labelled):
- Physics-inspired drift model: iceberg velocity ≈ ocean-current-driven + wind-drift coupling
  (wind drift coefficient ~ 0.01–0.02 of wind speed), plus size-dependent inertia.
- A learned residual corrector (small GBRT) trained on synthetic track data
  adjusts the drift prediction to capture unresolved effects.
- Prediction: propagate the state forward for each horizon; uncertainty grows
  with horizon (simple linear growth model).
- Supports: train(), predict(), evaluate(), save(), load().
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

from app.services.synthetic_data import (
    MIN_LAT,
    MAX_LAT,
    MIN_LON,
    MAX_LON,
    generate_icebergs,
    generate_ocean,
    generate_weather,
    iceberg_size_params,
)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
ICEBERG_MODEL_PATH = os.path.join(MODEL_DIR, "iceberg_model.json")

HORIZONS = [6, 12, 24, 48, 72]

# Wind drift coefficient (fraction of wind speed that translates to iceberg motion).
# Realistic values are ~0.01-0.02 for large icebergs; we use a configurable default.
WIND_DRIFT_COEFF = 0.015


def deg_per_meter_lat() -> float:
    return 1.0 / 111111.0


def deg_per_meter_lon(lat: float) -> float:
    return 1.0 / (111111.0 * math.cos(math.radians(lat)))


def velocity_from_speed_dir(speed_ms: float, dir_deg: float):
    """dir_deg: degrees clockwise from North (movement direction)."""
    rad = math.radians(dir_deg)
    v_n = speed_ms * math.cos(rad)
    v_e = speed_ms * math.sin(rad)
    return v_n, v_e


def dir_from_velocity(v_n: float, v_e: float) -> float:
    d = math.degrees(math.atan2(v_e, v_n))
    return (d + 360.0) % 360.0


def predict_drift(
    lat: float,
    lon: float,
    speed_ms: float,
    dir_deg: float,
    dt: datetime,
    hours: float,
) -> Tuple[float, float, float, float]:
    """Physics drift: constant velocity for `hours`."""
    v_n, v_e = velocity_from_speed_dir(speed_ms, dir_deg)
    d_n = v_n * hours * 3600.0
    d_e = v_e * hours * 3600.0
    dlat = d_n * deg_per_meter_lat()
    dlon = d_e * deg_per_meter_lon(lat)
    nlat = lat + dlat
    nlon = (lon + dlon + 180.0) % 360.0 - 180.0
    new_speed = speed_ms  # constant in pure drift
    new_dir = dir_deg
    return nlat, nlon, new_speed, new_dir


@dataclass
class IcebergModel:
    model: Optional[Any] = None
    data_source: str = "synthetic/demo"
    trained: bool = False
    training_metrics: Dict[str, Any] = field(default_factory=dict)

    def _synthetic_tracks(self, n: int = 600, seed: int = 20240909) -> pd.DataFrame:
        """Generate synthetic track history + future to train the residual corrector."""
        rng = np.random.default_rng(seed)
        rows: List[Dict[str, Any]] = []
        for _ in range(n):
            size = rng.choice(["Small", "Medium", "Large", "Very Large"], p=[0.4, 0.35, 0.2, 0.05])
            sp = iceberg_size_params(size)
            lat = float(rng.uniform(MIN_LAT, MAX_LAT))
            lon = float(rng.uniform(MIN_LON, MAX_LON))
            base_speed = sp["speed_base"] * rng.uniform(0.7, 1.3)
            direction = float(rng.uniform(0, 360))
            ts = datetime(2024, 7, 1, 0, 0, 0)
            w = generate_weather(lat, lon, ts)
            o = generate_ocean(lat, lon, ts)
            # target: where the iceberg actually ends after 24h (drift + noise)
            nlat, nlon, _, _ = predict_drift(lat, lon, base_speed, direction, ts, 24.0)
            # add residual that the model should learn (currents + wind + size effects)
            residual_lat = (o.current_speed_ms * math.cos(math.radians(o.current_dir_deg)) * 24 * 3600) * deg_per_meter_lat() * rng.uniform(0.8, 1.2)
            residual_lon = (o.current_speed_ms * math.sin(math.radians(o.current_dir_deg)) * 24 * 3600) * deg_per_meter_lon(lat) * rng.uniform(0.8, 1.2)
            wind_drift_lat = (w.wind_kmh / 3.6 * WIND_DRIFT_COEFF * math.cos(math.radians(w.wind_dir_deg + 180))) * 24 * 3600 * deg_per_meter_lat() * rng.uniform(0.8, 1.2)
            wind_drift_lon = (w.wind_kmh / 3.6 * WIND_DRIFT_COEFF * math.sin(math.radians(w.wind_dir_deg + 180))) * 24 * 3600 * deg_per_meter_lon(lat) * rng.uniform(0.8, 1.2)
            true_lat = nlat + residual_lat + wind_drift_lat
            true_lon = (nlon + residual_lon + wind_drift_lon + 180.0) % 360.0 - 180.0
            rows.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "speed_ms": base_speed,
                    "direction_deg": direction,
                    "size": size,
                    "current_speed": o.current_speed_ms,
                    "current_dir": o.current_dir_deg,
                    "wind_speed": w.wind_kmh,
                    "wind_dir": w.wind_dir_deg,
                    "air_temp": w.temperature_c,
                    "sst": o.sst_c,
                    "target_lat": true_lat,
                    "target_lon": true_lon,
                }
            )
        return pd.DataFrame(rows)

    def train(self, df: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
        if df is None:
            df = self._synthetic_tracks()
        # Predict latitude residual and longitude residual separately.
        feature_cols = [
            "lat",
            "lon",
            "speed_ms",
            "direction_deg",
            "size_code",
            "current_speed",
            "current_dir",
            "wind_speed",
            "wind_dir",
            "air_temp",
            "sst",
        ]
        df["size_code"] = df["size"].map({"Small": 0, "Medium": 1, "Large": 2, "Very Large": 3}).fillna(1).astype(float)

        # Drift baseline for 24h
        base_res = df.apply(
            lambda r: predict_drift(
                r["lat"], r["lon"], r["speed_ms"], r["direction_deg"], datetime(2024, 7, 1), 24.0
            ),
            axis=1,
        )
        df["drift_lat"] = [t[0] for t in base_res]
        df["drift_lon"] = [t[1] for t in base_res]

        # Residual = true - drift
        df["res_lat"] = df["target_lat"] - df["drift_lat"]
        df["res_lon"] = df["target_lon"] - df["drift_lon"]

        feat = df[feature_cols].copy()

        self.model_lat = GradientBoostingRegressor(
            n_estimators=150, max_depth=4, learning_rate=0.1, random_state=20240909
        )
        self.model_lon = GradientBoostingRegressor(
            n_estimators=150, max_depth=4, learning_rate=0.1, random_state=20240909
        )
        self.model_lat.fit(feat.values, df["res_lat"].values)
        self.model_lon.fit(feat.values, df["res_lon"].values)

        pred_lat = self.model_lat.predict(feat.values)
        pred_lon = self.model_lon.predict(feat.values)
        mae_lat = float(mean_absolute_error(df["res_lat"].values, pred_lat))
        mae_lon = float(mean_absolute_error(df["res_lon"].values, pred_lon))

        # Convert residual MAE to approximate distance error (degrees -> km)
        mean_lat = float(df["lat"].mean())
        deg_lat_km = 111.111
        deg_lon_km = 111.111 * math.cos(math.radians(mean_lat))
        dist_err_km = float(math.sqrt((mae_lat * deg_lat_km) ** 2 + (mae_lon * deg_lon_km) ** 2))

        self.training_metrics = {
            "mae_lat_residual_deg": round(mae_lat, 6),
            "mae_lon_residual_deg": round(mae_lon, 6),
            "approx_distance_error_km": round(dist_err_km, 2),
            "n_samples": int(len(df)),
            "data_source": self.data_source,
            "note": "Evaluation performed on synthetic/demo data.",
        }
        self.trained = True
        return self.training_metrics

    def _features(self, lat, lon, speed_ms, direction_deg, size, dt):
        w = generate_weather(lat, lon, dt)
        o = generate_ocean(lat, lon, dt)
        size_code = {"Small": 0, "Medium": 1, "Large": 2, "Very Large": 3}.get(size, 1)
        feat = np.array(
            [
                lat,
                lon,
                speed_ms,
                direction_deg,
                size_code,
                o.current_speed_ms,
                o.current_dir_deg,
                w.wind_kmh,
                w.wind_dir_deg,
                w.temperature_c,
                o.sst_c,
            ]
        )
        return feat.reshape(1, -1)

    def predict(
        self,
        iceberg: Dict[str, Any],
        dt: datetime,
        horizons: List[int] = HORIZONS,
    ) -> List[Dict[str, Any]]:
        """Return predicted lat/lon per horizon + uncertainty.

        iceberg dict must include: lat, lon, speed_ms, direction_deg, size, id.
        """
        if not self.trained:
            self.train()
        lat = float(iceberg["lat"])
        lon = float(iceberg["lon"])
        speed = float(iceberg.get("speed_ms", 0.5))
        direction = float(iceberg.get("direction_deg", 90.0))
        size = str(iceberg.get("size", "Medium"))
        out: List[Dict[str, Any]] = []
        for h in horizons:
            # Drift baseline
            nlat, nlon, _, _ = predict_drift(lat, lon, speed, direction, dt, h)
            # Learned residual (trained for 24h; scale approx linearly with sqrt(h/24) for longer horizons)
            scale = math.sqrt(max(1.0, h / 24.0))
            feat = self._features(lat, lon, speed, direction, size, dt)
            res_lat = float(self.model_lat.predict(feat)[0]) * scale
            res_lon = float(self.model_lon.predict(feat)[0]) * scale
            pred_lat = nlat + res_lat
            pred_lon = (nlon + res_lon + 180.0) % 360.0 - 180.0
            # Uncertainty: grows with horizon (simple model)
            base_uncertainty_km = 5.0
            uncertainty_km = base_uncertainty_km * (1.0 + 0.15 * h)
            confidence = max(50.0, 100.0 - (h / 72.0) * 30.0)
            out.append(
                {
                    "hours": h,
                    "timestamp": (dt + timedelta(hours=h)).isoformat(),
                    "lat": round(pred_lat, 4),
                    "lon": round(pred_lon, 4),
                    "uncertainty_km": round(uncertainty_km, 1),
                    "confidence": round(confidence, 1),
                    "note": "Prototype prediction; labelled synthetic/demo.",
                }
            )
        return out

    def evaluate(self) -> Dict[str, Any]:
        if not self.trained:
            self.train()
        return dict(self.training_metrics)

    def save(self, path: Optional[str] = None) -> str:
        path = path or ICEBERG_MODEL_PATH
        if not self.trained:
            self.train()
        import joblib

        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump(
            {
                "model_lat": self.model_lat,
                "model_lon": self.model_lon,
                "trained": True,
                "training_metrics": self.training_metrics,
                "data_source": self.data_source,
            },
            path,
        )
        return path

    def load(self, path: Optional[str] = None) -> "IcebergModel":
        path = path or ICEBERG_MODEL_PATH
        if not os.path.exists(path):
            self.train()
            return self.save(path) or self
        import joblib

        bundle = joblib.load(path)
        self.model_lat = bundle.get("model_lat")
        self.model_lon = bundle.get("model_lon")
        self.trained = bool(self.model_lat)
        self.training_metrics = bundle.get("training_metrics", {})
        self.data_source = bundle.get("data_source", self.data_source)
        return self


_iceberg: Optional[IcebergModel] = None


def get_iceberg_model() -> IcebergModel:
    global _iceberg
    if _iceberg is None:
        _iceberg = IcebergModel()
        try:
            _iceberg.load()
        except Exception:
            _iceberg.train()
    return _iceberg
