# -*- coding: utf-8 -*-
"""Preprocessing utilities for ML inputs and CSV ingestion."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import pandas as pd


def validate_coordinate(lat: float, lon: float, southern: bool = True) -> bool:
    if southern:
        if not (-90.0 <= lat <= -60.0):
            return False
    else:
        if not (-90.0 <= lat <= 90.0):
            return False
    if not (-180.0 <= lon <= 180.0):
        return False
    return True


def normalize_sea_ice_record(r: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    out["lat"] = float(r.get("lat", r.get("latitude", 0.0)))
    out["lon"] = float(r.get("lon", r.get("longitude", 0.0)))
    out["concentration"] = float(r.get("concentration", r.get("sea_ice_concentration", 0.0)))
    out["timestamp"] = r.get("timestamp", r.get("date", r.get("time", "")))
    out["temperature"] = float(r.get("temperature", r.get("air_temp", 0.0)))
    out["sst"] = float(r.get("sst", r.get("sea_surface_temperature", 0.0)))
    out["wind_speed"] = float(r.get("wind_speed", r.get("wind", 0.0)))
    out["wind_dir"] = float(r.get("wind_dir", r.get("wind_direction", 0.0)))
    out["current_speed"] = float(r.get("current_speed", r.get("ocean_current_speed", 0.0)))
    out["current_dir"] = float(r.get("current_dir", r.get("ocean_current_direction", 0.0)))
    out["latitude"] = out["lat"]
    out["longitude"] = out["lon"]
    return out


def detect_missing(df: pd.DataFrame, report: Dict[str, Any]) -> Dict[str, Any]:
    missing = df.isnull().sum().to_dict()
    total_cells = df.shape[0] * df.shape[1]
    missing_cells = int(df.isnull().sum().sum())
    report["missing_values_pct"] = round(100.0 * missing_cells / total_cells, 2) if total_cells else 0.0
    report["missing_by_column"] = {k: int(v) for k, v in missing.items()}
    return report


def detect_invalid_coords(df: pd.DataFrame, report: Dict[str, Any]) -> Dict[str, Any]:
    lat_col = None
    lon_col = None
    for c in df.columns:
        cl = c.lower()
        if "lat" in cl:
            lat_col = c
        if "lon" in cl or "lng" in cl:
            lon_col = c
    bad = 0
    if lat_col is not None and lon_col is not None:
        for _, row in df.iterrows():
            try:
                la = float(row[lat_col])
                lo = float(row[lon_col])
                if not validate_coordinate(la, lo):
                    bad += 1
            except Exception:
                bad += 1
    report["invalid_coordinates"] = bad
    return report


def data_quality_report(df: pd.DataFrame, dataset_name: str) -> Dict[str, Any]:
    report: Dict[str, Any] = {
        "dataset": dataset_name,
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "date_range": "",
        "status": "pending",
    }
    # date range heuristic: look for a datetime-like column
    for c in df.columns:
        cl = str(c).lower()
        if "date" in cl or "time" in cl or "timestamp" in cl:
            try:
                s = pd.to_datetime(df[c], errors="coerce").dropna()
                if len(s):
                    report["date_range"] = f"{s.min().date()} – {s.max().date()}"
            except Exception:
                pass
            break
    detect_missing(df, report)
    detect_invalid_coords(df, report)
    if report["missing_values_pct"] < 5.0 and report["invalid_coordinates"] == 0:
        report["status"] = "ready"
    elif report["missing_values_pct"] < 15.0:
        report["status"] = "usable_with_caution"
    else:
        report["status"] = "needs_cleaning"
    return report
