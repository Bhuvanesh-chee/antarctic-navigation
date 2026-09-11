# -*- coding: utf-8 -*-
"""Sea-ice concentration forecasting model.

Approach (clearly labelled as a prototype baseline):
- Supervised regressor: sea-ice concentration ~ lat + lon + seasonal + met/ocean features.
- Trained on synthetic demo data (NOT official NCPOR data).
- Forecasts for +24/+48/+72/+96/+120h are produced by projecting the input
  feature vector forward in time (seasonal shift + simple feature drift) and
  running the trained model. This is a demonstration forecasting technique,
  not an operational sea-ice forecast.

Supports: train(), predict(), evaluate(), save(), load().
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from app.services.synthetic_data import (
    MIN_LAT,
    MAX_LAT,
    MIN_LON,
    MAX_LON,
    generate_ice_concentration,
    generate_weather,
    generate_ocean,
)
from app.services.feature_engineering import day_of_year, seasonal_phase

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
SEAICE_MODEL_PATH = os.path.join(MODEL_DIR, "sea_ice_model.json")

# Forecast horizons in hours
HORIZONS = [24, 48, 72, 96, 120]

# Ice risk thresholds (configurable)
ICE_THRESHOLDS = [
    (20, "LOW"),
    (50, "MODERATE"),
    (75, "HIGH"),
    (100, "VERY HIGH"),
]


def classify_ice(c: float) -> str:
    for threshold, label in ICE_THRESHOLDS:
        if c <= threshold:
            return label
    return "VERY HIGH"


def build_demo_dataset(n_samples: int = 4000, seed: int = 20240909) -> pd.DataFrame:
    """Build a demo training set from the synthetic generator.

    Features: lat, lon, day_of_year, seasonal, air_temp, sst, wind_speed,
    wind_dir, current_speed, current_dir.
    Target: concentration.
    """
    rng = np.random.default_rng(seed)
    rows: List[Dict[str, Any]] = []
    for _ in range(n_samples):
        lat = float(rng.uniform(MIN_LAT, MAX_LAT))
        lon = float(rng.uniform(MIN_LON, MAX_LON))
        day = int(rng.integers(1, 366))
        dt = datetime(2024, 1, 1) + timedelta(days=day - 1)
        w = generate_weather(lat, lon, dt)
        o = generate_ocean(lat, lon, dt)
        c = generate_ice_concentration(lat, lon, dt)
        rows.append(
            {
                "lat": lat,
                "lon": lon,
                "day_of_year": day,
                "seasonal": seasonal_phase(dt),
                "air_temp": w.temperature_c,
                "sst": o.sst_c,
                "wind_speed": w.wind_kmh,
                "wind_dir": w.wind_dir_deg,
                "current_speed": o.current_speed_ms,
                "current_dir": o.current_dir_deg,
                "concentration": c,
            }
        )
    df = pd.DataFrame(rows)
    return df


@dataclass
class SeaIceModel:
    model: Optional[Any] = None
    feature_cols: List[str] = field(
        default_factory=lambda: [
            "lat",
            "lon",
            "day_of_year",
            "seasonal",
            "air_temp",
            "sst",
            "wind_speed",
            "wind_dir",
            "current_speed",
            "current_dir",
        ]
    )
    trained: bool = False
    training_metrics: Dict[str, Any] = field(default_factory=dict)
    data_source: str = "synthetic/demo"

    def train(self, df: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
        if df is None:
            df = build_demo_dataset()
        X = df[self.feature_cols].values
        y = df["concentration"].values
        self.model = GradientBoostingRegressor(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.08,
            min_samples_leaf=5,
            random_state=20240909,
        )
        self.model.fit(X, y)
        pred = self.model.predict(X)
        mae = float(mean_absolute_error(y, pred))
        rmse = float(math.sqrt(mean_squared_error(y, pred)))
        r2 = float(r2_score(y, pred))
        self.training_metrics = {
            "mae": round(mae, 3),
            "rmse": round(rmse, 3),
            "r2": round(r2, 4),
            "n_samples": int(len(y)),
            "data_source": self.data_source,
            "note": "Evaluation performed on synthetic/demo data.",
        }
        self.trained = True
        return self.training_metrics

    def _project_features(
        self, base: Dict[str, Any], dt: datetime
    ) -> np.ndarray:
        """Project a base feature dict to a future datetime.

        Simple demo projection: shift seasonal, apply mild drift to met/ocean
        features, keep lat/lon fixed (point forecast at a location).
        """
        day = day_of_year(dt)
        seas = seasonal_phase(dt)
        # mild seasonal drift on temperature/sst
        temp = base.get("air_temp", -10.0) + 2.0 * math.cos(2 * math.pi * (day - 240) / 365.0) - 2.0 * math.cos(2 * math.pi * (base.get("day_of_year", 240) - 240) / 365.0)
        sst = base.get("sst", -1.8)
        wind = base.get("wind_speed", 20.0) * (1.0 + 0.05 * math.sin(math.radians(day)))
        wind_dir = base.get("wind_dir", 0.0)
        current_speed = base.get("current_speed", 0.4)
        current_dir = base.get("current_dir", 90.0)
        feat = np.array(
            [
                base.get("lat", -70.0),
                base.get("lon", 0.0),
                day,
                seas,
                temp,
                sst,
                wind,
                wind_dir,
                current_speed,
                current_dir,
            ]
        )
        return feat.reshape(1, -1)

    def predict(
        self,
        lat: float,
        lon: float,
        dt: datetime,
        base_features: Optional[Dict[str, Any]] = None,
        horizons: List[int] = HORIZONS,
    ) -> List[Dict[str, Any]]:
        """Return forecast for each horizon.

        If base_features is provided it seeds the projection; otherwise we
        synthesize a baseline feature vector at (lat, lon, dt).
        """
        if not self.trained:
            self.train()
        if base_features is None:
            w = generate_weather(lat, lon, dt)
            o = generate_ocean(lat, lon, dt)
            base_features = {
                "lat": lat,
                "lon": lon,
                "day_of_year": day_of_year(dt),
                "seasonal": seasonal_phase(dt),
                "air_temp": w.temperature_c,
                "sst": o.sst_c,
                "wind_speed": w.wind_kmh,
                "wind_dir": w.wind_dir_deg,
                "current_speed": o.current_speed_ms,
                "current_dir": o.current_dir_deg,
            }
        out: List[Dict[str, Any]] = []
        for h in horizons:
            t = dt + timedelta(hours=h)
            X = self._project_features(base_features, t)
            pred = float(self.model.predict(X)[0])
            pred = max(0.0, min(100.0, pred))
            out.append(
                {
                    "hours": h,
                    "timestamp": t.isoformat(),
                    "concentration": round(pred, 1),
                    "risk": classify_ice(pred),
                }
            )
        return out

    def evaluate(self) -> Dict[str, Any]:
        if not self.trained:
            self.train()
        return dict(self.training_metrics)

    def save(self, path: Optional[str] = None) -> str:
        path = path or SEAICE_MODEL_PATH
        if not self.trained:
            self.train()
        if self.model is not None:
            booster = self.model
            # Serialize as a lightweight re-creatable description. For a demo
            # prototype we persist tree info via joblib-style dump using sklearn's
            # native serialization to a compressed archive.
            import joblib

            os.makedirs(os.path.dirname(path), exist_ok=True)
            joblib.dump(
                {
                    "model": self.model,
                    "feature_cols": self.feature_cols,
                    "trained": True,
                    "training_metrics": self.training_metrics,
                    "data_source": self.data_source,
                },
                path,
            )
            return path
        raise RuntimeError("Model not trained; cannot save.")

    def load(self, path: Optional[str] = None) -> "SeaIceModel":
        path = path or SEAICE_MODEL_PATH
        if not os.path.exists(path):
            self.train()
            return self.save(path) or self
        import joblib

        bundle = joblib.load(path)
        self.model = bundle.get("model")
        self.feature_cols = bundle.get("feature_cols", self.feature_cols)
        self.trained = bool(self.model)
        self.training_metrics = bundle.get("training_metrics", {})
        self.data_source = bundle.get("data_source", self.data_source)
        return self


# Module-level singleton
_seaice: Optional[SeaIceModel] = None


def get_seaice_model() -> SeaIceModel:
    global _seaice
    if _seaice is None:
        _seaice = SeaIceModel()
        try:
            _seaice.load()
        except Exception:
            _seaice.train()
    return _seaice
