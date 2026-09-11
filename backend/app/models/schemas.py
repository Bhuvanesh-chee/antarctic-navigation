# -*- coding: utf-8 -*-
"""Pydantic models for the API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class VesselConfig(BaseModel):
    name: str = "Polar Research Vessel"
    start_lat: float = Field(-68.0, ge=-90, le=90)
    start_lon: float = Field(0.0, ge=-180, le=180)
    dest_lat: float = Field(-72.0, ge=-90, le=90)
    dest_lon: float = Field(10.0, ge=-180, le=180)
    max_speed_knots: float = Field(14.0, gt=0)
    fuel_capacity_l: float = Field(50000.0, gt=0)
    consumption_l_per_nm: float = Field(25.0, gt=0)
    ice_class: str = "Ice-capable"


class SeaIcePredictRequest(BaseModel):
    lat: float = Field(-70.0, ge=-90, le=90)
    lon: float = Field(0.0, ge=-180, le=180)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    horizons: Optional[List[int]] = None
    base_features: Optional[Dict[str, Any]] = None


class SeaIcePredictResponse(BaseModel):
    lat: float
    lon: float
    timestamp: str
    forecast: List[Dict[str, Any]]
    data_source: str = "synthetic/demo"
    note: str = "Prototype prediction; labelled synthetic/demo."


class IcebergTrack(BaseModel):
    id: str
    lat: float
    lon: float
    timestamp: str
    speed_ms: float
    direction_deg: float
    size: str
    height_m: Optional[float] = None
    data_source: str = "synthetic/demo"


class IcebergPredictRequest(BaseModel):
    iceberg: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    horizons: Optional[List[int]] = None


class IcebergPredictResponse(BaseModel):
    iceberg_id: str
    predictions: List[Dict[str, Any]]
    data_source: str = "synthetic/demo"
    note: str = "Prototype prediction; labelled synthetic/demo."


class WeatherResponse(BaseModel):
    lat: float
    lon: float
    timestamp: str
    wind_kmh: float
    wind_dir_deg: float
    temperature_c: float
    pressure_mb: float
    visibility_km: float
    precipitation_mm: float
    wave_height_m: float
    wave_dir_deg: float
    storm: bool
    data_source: str = "synthetic/demo"


class OceanResponse(BaseModel):
    lat: float
    lon: float
    timestamp: str
    current_speed_ms: float
    current_dir_deg: float
    sst_c: float
    salinity_psu: float
    wave_height_m: float
    depth_m: float
    data_source: str = "synthetic/demo"


class RouteOptimizeRequest(BaseModel):
    vessel: VesselConfig
    mode: str = "balanced"  # safety, fuel, speed, balanced
    weights: Optional[Dict[str, float]] = None


class RouteOptimizeResponse(BaseModel):
    routes: List[Dict[str, Any]]
    selected_mode: str
    weights_used: Dict[str, float]
    data_source: str = "synthetic/demo"
    note: str = "Prototype route optimization; labelled synthetic/demo."


class Alert(BaseModel):
    id: str
    level: str  # info, warning, danger
    category: str
    title: str
    message: str
    recommended_action: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class DataUploadResponse(BaseModel):
    dataset: str
    rows: int
    columns: int
    missing_values_pct: float
    invalid_coordinates: int
    date_range: str
    status: str
    columns_received: List[str]


class SeaIceGridPoint(BaseModel):
    lat: float
    lon: float
    concentration: float
    risk: str
    timestamp: str


class IcebergDetail(BaseModel):
    id: str
    lat: float
    lon: float
    timestamp: str
    speed_ms: float
    direction_deg: float
    size: str
    height_m: Optional[float] = None
    predictions: Optional[List[Dict[str, Any]]] = None
    collision_risk: Optional[float] = None
    data_source: str = "synthetic/demo"
