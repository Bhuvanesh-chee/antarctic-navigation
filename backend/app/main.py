# -*- coding: utf-8 -*-
"""FastAPI application for the Antarctic Navigation Decision Support System.

Provides endpoints for:
- Sea-ice data + forecast
- Iceberg tracking + trajectory prediction
- Weather + ocean conditions
- Route optimization (A* / Dijkstra)
- Risk analysis
- Data upload + quality report

Run: uvicorn app.main:app --host 0.0.0.0 --port 7860
Docs: http://localhost:7860/docs
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.models.schemas import (
    Alert,
    DataUploadResponse,
    IcebergDetail,
    IcebergPredictRequest,
    IcebergPredictResponse,
    OceanResponse,
    RouteOptimizeRequest,
    RouteOptimizeResponse,
    SeaIceGridPoint,
    SeaIcePredictRequest,
    SeaIcePredictResponse,
    VesselConfig,
    WeatherResponse,
)
from app.services.synthetic_data import (
    dt_series,
    generate_icebergs,
    generate_ocean,
    generate_sea_ice_grid,
    generate_weather,
    haversin_nm,
)
from app.services.preprocessing import data_quality_report, validate_coordinate
from app.services.feature_engineering import distance_nm
from app.ml.sea_ice_model import get_seaice_model, SeaIceModel
from app.ml.iceberg_model import get_iceberg_model, IcebergModel
from app.routing.route_optimizer import (
    NavigationGrid,
    generate_alternative_routes,
    risk_label,
)
from app.risk.engine import composite_point_risk, composite_route_risk
from app.services.fuel_model import estimate_time_hours, fuel_for_route

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("antarctic_nav")

app = FastAPI(
    title="Antarctic Navigation Decision Support System",
    version="0.1.0",
    description="AI-enabled sea-ice forecasting, iceberg trajectory prediction, "
    "and safe/fuel-efficient route optimization for Antarctic research vessels. "
    "Prototype demonstrator for Smart India Hackathon PS-26059 (MoES/NCPOR).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Serve the built frontend as static files at "/" (Hugging Face Space style).
# The Vite build produces dist/index.html + assets; we mount dist so that "/"
# serves index.html and "/assets/..." serves the bundled JS/CSS.
# ---------------------------------------------------------------------------
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets"), html=False), name="frontend_assets")


from fastapi.responses import FileResponse


@app.get("/")
def index():
    """Serve the built frontend entry point explicitly (StaticFiles html=True
    sometimes doesn't resolve "/" → index.html on all backends)."""
    return FileResponse(FRONTEND_DIST / "index.html")


# ---------------------------------------------------------------------------
# Synthetic data cache (rebuilt per request by default; can be cached)
# ---------------------------------------------------------------------------

ANCHOR_TIMESTAMP = datetime(2024, 8, 1, 0, 0, 0)
DEFAULT_BOUNDS = (-78.0, -60.0, -180.0, 180.0)


def _build_environment(
    ts: datetime = ANCHOR_TIMESTAMP,
):
    _cache = getattr(_build_environment, "_cache", None)
    if _cache is not None and _cache["timestamp"] == ts.isoformat():
        return _cache["env"]

    lat_min, lat_max, lon_min, lon_max = -78.0, -60.0, -180.0, 180.0
    ice_grid = generate_sea_ice_grid(ts, lat_step=4.0, lon_step=10.0, bounds=(lat_min, lat_max, lon_min, lon_max))
    icebergs = generate_icebergs(18, ts)
    weather_map: Dict = {}
    ocean_map: Dict = {}
    # Sparse map-only sample for weather/ocean lookups (startup cost stays low).
    for lat in range(int(lat_min), int(lat_max) + 1, 4):
        for lon in range(int(lon_min), int(lon_max) + 1, 10):
            w = generate_weather(float(lat), float(lon), ts)
            o = generate_ocean(float(lat), float(lon), ts)
            weather_map[(round(float(lat), 2), round(float(lon), 2))] = {
                "wind_kmh": w.wind_kmh,
                "wind_dir_deg": w.wind_dir_deg,
                "temperature_c": w.temperature_c,
                "pressure_mb": w.pressure_mb,
                "visibility_km": w.visibility_km,
                "precipitation_mm": w.precipitation_mm,
                "wave_height_m": w.wave_height_m,
                "wave_dir_deg": w.wave_dir_deg,
                "storm": w.storm,
            }
            ocean_map[(round(float(lat), 2), round(float(lon), 2))] = {
                "current_speed_ms": o.current_speed_ms,
                "current_dir_deg": o.current_dir_deg,
                "sst_c": o.sst_c,
                "salinity_psu": o.salinity_psu,
                "wave_height_m": o.wave_height_m,
                "depth_m": o.depth_m,
            }
    env = {
        "timestamp": ts.isoformat(),
        "lat_min": lat_min,
        "lat_max": lat_max,
        "lon_min": lon_min,
        "lon_max": lon_max,
        "ice_grid": [{"lat": p.lat, "lon": p.lon, "concentration": p.concentration, "risk": p.risk} for p in ice_grid],
        "icebergs": [
            {
                "id": ib.id,
                "lat": ib.lat,
                "lon": ib.lon,
                "timestamp": ib.timestamp.isoformat(),
                "speed_ms": ib.speed_ms,
                "direction_deg": ib.direction_deg,
                "size": ib.size,
                "height_m": ib.height_m,
            }
            for ib in icebergs
        ],
        "weather_map": weather_map,
        "ocean_map": ocean_map,
    }
    _build_environment._cache = {"timestamp": ts.isoformat(), "env": env}
    return env


def _default_vessel() -> VesselConfig:
    return VesselConfig(
        name="Polar Research Vessel 01",
        start_lat=-68.0,
        start_lon=0.0,
        dest_lat=-72.0,
        dest_lon=10.0,
        max_speed_knots=14.0,
        fuel_capacity_l=50000.0,
        consumption_l_per_nm=25.0,
        ice_class="Ice-capable",
    )


# ---------------------------------------------------------------------------
# Health + info
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "antarctic-navigation", "version": "0.1.0"}


@app.get("/info")
def info():
    return {
        "name": "Antarctic Navigation Decision Support System",
        "problem_statement": "26059",
        "organization": "MoES / NCPOR",
        "note": "Prototype demonstrator. Synthetic/demo data is used unless real data is uploaded.",
        "disclaimer": "This system is a prototype and is NOT certified for real-world vessel navigation.",
    }


# ---------------------------------------------------------------------------
# Sea ice
# ---------------------------------------------------------------------------

@app.get("/api/sea-ice", response_model=List[SeaIceGridPoint])
def get_sea_ice(
    ts: Optional[str] = Query(None, description="ISO timestamp; defaults to anchor time"),
    horizon: Optional[int] = Query(None, description="If set, return predicted grid at this horizon (h)"),
):
    """Return the sea-ice concentration grid.

    If horizon is provided, returns predicted concentration at that horizon
    for each grid cell (prototype forecast grid).
    """
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    if horizon is None:
        return [
            SeaIceGridPoint(
                lat=p["lat"],
                lon=p["lon"],
                concentration=p["concentration"],
                risk=p["risk"],
                timestamp=env["timestamp"],
            )
            for p in env["ice_grid"]
        ]
    # Build a forecast grid by projecting each cell.
    model = get_seaice_model()
    out = []
    for p in env["ice_grid"]:
        preds = model.predict(p["lat"], p["lon"], ts_dt, horizons=[horizon])
        if preds:
            out.append(
                SeaIceGridPoint(
                    lat=p["lat"],
                    lon=p["lon"],
                    concentration=preds[0]["concentration"],
                    risk=preds[0]["risk"],
                    timestamp=preds[0]["timestamp"],
                )
            )
        else:
            out.append(
                SeaIceGridPoint(
                    lat=p["lat"],
                    lon=p["lon"],
                    concentration=p["concentration"],
                    risk=p["risk"],
                    timestamp=env["timestamp"],
                )
            )
    return out


@app.post("/api/sea-ice/predict", response_model=SeaIcePredictResponse)
def predict_sea_ice(body: SeaIcePredictRequest):
    """Predict sea-ice concentration at a point for multiple horizons."""
    model = get_seaice_model()
    horizons = body.horizons or [24, 48, 72, 96, 120]
    forecast = model.predict(body.lat, body.lon, body.timestamp, body.base_features, horizons)
    return SeaIcePredictResponse(
        lat=body.lat,
        lon=body.lon,
        timestamp=body.timestamp.isoformat(),
        forecast=forecast,
        data_source=model.data_source,
        note="Prototype prediction; labelled synthetic/demo.",
    )


@app.get("/api/sea-ice/evaluation")
def sea_ice_evaluation():
    model = get_seaice_model()
    return {"metrics": model.evaluate()}


# ---------------------------------------------------------------------------
# Icebergs
# ---------------------------------------------------------------------------

@app.get("/api/icebergs", response_model=List[IcebergDetail])
def get_icebergs(ts: Optional[str] = Query(None)):
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    model = get_iceberg_model()
    out = []
    for ib in env["icebergs"]:
        preds = model.predict(ib, ts_dt)
        out.append(
            IcebergDetail(
                id=ib["id"],
                lat=ib["lat"],
                lon=ib["lon"],
                timestamp=ib["timestamp"],
                speed_ms=ib["speed_ms"],
                direction_deg=ib["direction_deg"],
                size=ib["size"],
                height_m=ib.get("height_m"),
                predictions=preds,
                data_source="synthetic/demo",
            )
        )
    return out


@app.post("/api/iceberg/predict", response_model=IcebergPredictResponse)
def predict_iceberg(body: IcebergPredictRequest):
    model = get_iceberg_model()
    horizons = body.horizons or [6, 12, 24, 48, 72]
    preds = model.predict(body.iceberg, body.timestamp, horizons)
    return IcebergPredictResponse(
        iceberg_id=body.iceberg.get("id", "UNKNOWN"),
        predictions=preds,
        data_source=model.data_source,
        note="Prototype prediction; labelled synthetic/demo.",
    )


@app.get("/api/iceberg/evaluation")
def iceberg_evaluation():
    model = get_iceberg_model()
    return {"metrics": model.evaluate()}


# ---------------------------------------------------------------------------
# Weather / Ocean
# ---------------------------------------------------------------------------

@app.get("/api/weather")
def get_weather(lat: float = Query(-70.0), lon: float = Query(0.0), ts: Optional[str] = Query(None)):
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    key = (round(lat, 2), round(lon, 2))
    w = env["weather_map"].get(key)
    if not w:
        w = {
            "wind_kmh": 22.0,
            "wind_dir_deg": 120.0,
            "temperature_c": -14.0,
            "pressure_mb": 990.0,
            "visibility_km": 25.0,
            "precipitation_mm": 1.0,
            "wave_height_m": 2.1,
            "wave_dir_deg": 120.0,
            "storm": False,
        }
        return WeatherResponse(
            lat=lat,
            lon=lon,
            timestamp=ts_dt.isoformat(),
            wind_kmh=w["wind_kmh"],
            wind_dir_deg=w["wind_dir_deg"],
            temperature_c=w["temperature_c"],
            pressure_mb=w["pressure_mb"],
            visibility_km=w["visibility_km"],
            precipitation_mm=w["precipitation_mm"],
            wave_height_m=w["wave_height_m"],
            wave_dir_deg=w["wave_dir_deg"],
            storm=w["storm"],
            data_source="synthetic/demo",
        )
    return WeatherResponse(
        lat=lat,
        lon=lon,
        timestamp=ts_dt.isoformat(),
        wind_kmh=w["wind_kmh"],
        wind_dir_deg=w["wind_dir_deg"],
        temperature_c=w["temperature_c"],
        pressure_mb=w["pressure_mb"],
        visibility_km=w["visibility_km"],
        precipitation_mm=w["precipitation_mm"],
        wave_height_m=w["wave_height_m"],
        wave_dir_deg=w["wave_dir_deg"],
        storm=w["storm"],
        data_source="synthetic/demo",
    )


def _generate_weather_point(lat: float, lon: float, ts: datetime) -> Dict[str, Any]:
    """Fallback weather point when the sparse map has no entry."""
    return {
        "wind_kmh": 22.0,
        "wind_dir_deg": 120.0,
        "temperature_c": -14.0,
        "pressure_mb": 990.0,
        "visibility_km": 25.0,
        "precipitation_mm": 1.0,
        "wave_height_m": 2.1,
        "wave_dir_deg": 120.0,
        "storm": False,
    }


@app.get("/api/ocean")
def get_ocean(lat: float = Query(-70.0), lon: float = Query(0.0), ts: Optional[str] = Query(None)):
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    key = (round(lat, 2), round(lon, 2))
    o = env["ocean_map"].get(key)
    if not o:
        o = {
            "current_speed_ms": 0.4,
            "current_dir_deg": 90.0,
            "sst_c": -1.8,
            "salinity_psu": 34.2,
            "wave_height_m": 2.0,
            "depth_m": 1200.0,
        }
        return OceanResponse(
            lat=lat,
            lon=lon,
            timestamp=ts_dt.isoformat(),
            current_speed_ms=o["current_speed_ms"],
            current_dir_deg=o["current_dir_deg"],
            sst_c=o["sst_c"],
            salinity_psu=o["salinity_psu"],
            wave_height_m=o["wave_height_m"],
            depth_m=o["depth_m"],
            data_source="synthetic/demo",
        )
    return OceanResponse(
        lat=lat,
        lon=lon,
        timestamp=ts_dt.isoformat(),
        current_speed_ms=o["current_speed_ms"],
        current_dir_deg=o["current_dir_deg"],
        sst_c=o["sst_c"],
        salinity_psu=o["salinity_psu"],
        wave_height_m=o["wave_height_m"],
        depth_m=o["depth_m"],
        data_source="synthetic/demo",
    )


def _generate_ocean_point(lat: float, lon: float, ts: datetime) -> Dict[str, Any]:
    """Fallback ocean point when the sparse map has no entry."""
    return {
        "current_speed_ms": 0.4,
        "current_dir_deg": 90.0,
        "sst_c": -1.8,
        "salinity_psu": 34.2,
        "wave_height_m": 2.0,
        "depth_m": 1200.0,
    }


# ---------------------------------------------------------------------------
# Risk + Alerts
# ---------------------------------------------------------------------------

@app.get("/api/risk/at-point")
def risk_at_point(
    lat: float = Query(-68.0),
    lon: float = Query(0.0),
    dest_lat: float = Query(-72.0),
    dest_lon: float = Query(10.0),
    ts: Optional[str] = Query(None),
):
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    key = (round(lat, 2), round(lon, 2))
    w = env["weather_map"].get(key, {})
    if not w:
        w = _generate_weather_point(lat, lon, ts_dt)
    o = env["ocean_map"].get(key, {})
    if not o:
        o = _generate_ocean_point(lat, lon, ts_dt)
    # find nearest iceberg distance
    nearest_iceberg_km = 100.0
    for ib in env["icebergs"]:
        d_nm = distance_nm(lat, lon, ib["lat"], ib["lon"])
        d_km = d_nm * 1.852
        if d_km < nearest_iceberg_km:
            nearest_iceberg_km = d_km
    bearing = 0.0  # approximate
    risk = composite_point_risk(
        lat=lat,
        lon=lon,
        ice_concentration=w.get("concentration", 30.0),
        iceberg_proximity_km=nearest_iceberg_km,
        wind_kmh=w.get("wind_kmh", 20.0),
        storm=w.get("storm", False),
        visibility_km=w.get("visibility_km", 25.0),
        temperature_c=w.get("temperature_c", -10.0),
        wave_height_m=w.get("wave_height_m", 2.0),
        current_speed_ms=o.get("current_speed_ms", 0.4),
        current_dir_deg=o.get("current_dir_deg", 90.0),
        route_bearing_deg=bearing,
    )
    alerts = _build_alerts(env, lat, lon, dest_lat, dest_lon)
    return {"risk": risk, "alerts": alerts, "data_source": "synthetic/demo"}


@app.get("/api/alerts")
def get_alerts(lat: float = Query(-68.0), lon: float = Query(0.0), dest_lat: float = Query(-72.0), dest_lon: float = Query(10.0), ts: Optional[str] = Query(None)):
    ts_dt = datetime.fromisoformat(ts) if ts else ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)
    return {"alerts": _build_alerts(env, lat, lon, dest_lat, dest_lon), "data_source": "synthetic/demo"}


def _build_alerts(env: Dict[str, Any], lat: float, lon: float, dest_lat: float, dest_lon: float) -> List[Dict[str, Any]]:
    alerts = []
    now = datetime.fromisoformat(env["timestamp"])
    # Ice alert: forecast grid for this timestamp, check horizons for >70%
    model = get_seaice_model()
    fc = model.predict(lat, lon, now, horizons=[24, 48, 72])
    for p in fc:
        if p["concentration"] >= 70:
            alerts.append(
                Alert(
                    id=f"ice-{p['hours']}",
                    level="warning",
                    category="sea_ice",
                    title="HIGH SEA-ICE ALERT",
                    message=f"Sea-ice concentration expected to reach {p['concentration']:.0f}% within the next {p['hours']} hours.",
                    recommended_action="Review route and consider safer corridor.",
                ).model_dump()
            )
    # Iceberg trajectory alert: check predicted iceberg positions vs route corridor
    iceberg_model = get_iceberg_model()
    for ib in env["icebergs"]:
        preds = iceberg_model.predict(ib, now)
        for p in preds:
            if p["hours"] in (24, 48, 72):
                d_nm = distance_nm(dest_lat, dest_lon, p["lat"], p["lon"])
                d_km = d_nm * 1.852
                if d_km < 50:
                    alerts.append(
                        Alert(
                            id=f"iceberg-{ib['id']}-{p['hours']}",
                            level="warning",
                            category="iceberg",
                            title="ICEBERG TRAJECTORY ALERT",
                            message=f"Iceberg {ib['id']} predicted position at +{p['hours']}h is within {d_km:.0f} km of the destination corridor.",
                            recommended_action="Recalculate navigation route.",
                        ).model_dump()
                    )
    if not alerts:
        alerts.append(
            Alert(
                id="route-clear",
                level="info",
                category="route",
                title="ROUTE CLEAR",
                message="No major hazards detected along the planned route.",
                recommended_action=None,
            ).model_dump()
        )
    return alerts


# ---------------------------------------------------------------------------
# Route optimization
# ---------------------------------------------------------------------------

@app.post("/api/route/optimize", response_model=RouteOptimizeResponse)
def optimize_route(body: RouteOptimizeRequest):
    v = body.vessel or _default_vessel()
    start_lat = float(v.start_lat)
    start_lon = float(v.start_lon)
    dest_lat = float(v.dest_lat)
    dest_lon = float(v.dest_lon)

    if not validate_coordinate(start_lat, start_lon):
        raise HTTPException(status_code=400, detail="Invalid start coordinates")
    if not validate_coordinate(dest_lat, dest_lon):
        raise HTTPException(status_code=400, detail="Invalid destination coordinates")

    ts_dt = ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)

    weights = body.weights or _choose_weights(body.mode)
    grid = NavigationGrid(-78.0, -60.0, -180.0, 180.0, step_deg=0.5)
    ice_predictions = {}
    model = get_iceberg_model()
    for ib in env["icebergs"]:
        ice_predictions[ib["id"]] = model.predict(ib, ts_dt)

    grid.build(
        ice_grid=env["ice_grid"],
        icebergs=env["icebergs"],
        ice_predictions=ice_predictions,
        weather_map=env["weather_map"],
        ocean_map=env["ocean_map"],
        start_lat=start_lat,
        start_lon=start_lon,
        dest_lat=dest_lat,
        dest_lon=dest_lon,
    )
    vessel_dict = {
        "max_speed_knots": v.max_speed_knots,
        "fuel_capacity_l": v.fuel_capacity_l,
        "consumption_l_per_nm": v.consumption_l_per_nm,
        "ice_class": v.ice_class,
    }
    routes = generate_alternative_routes(
        grid,
        start_lat,
        start_lon,
        dest_lat,
        dest_lon,
        vessel_dict,
        weights,
    )

    # Attach fuel + time + explainability for each route
    for r in routes:
        fuel = fuel_for_route(
            {"distance_nm": r.distance_nm, "explainability": r.explainability},
            vessel_dict,
        )
        hours = estimate_time_hours(
            {"distance_nm": r.distance_nm, "explainability": r.explainability},
            vessel_dict,
        )
        r.estimated_hours = hours
        r.estimated_fuel_l = fuel["total_fuel_l"]
        risk = composite_route_risk(r)
        r.risk_score = risk["score"]
        r.risk_label = risk["label"]
        r.explainability = {
            **r.explainability,
            **risk["components"],
            "fuel_breakdown": fuel,
            "estimated_hours": hours,
            "modes_compared": {
                "safety_contribution": risk["components"]["ice"] + risk["components"]["iceberg"],
                "fuel_contribution": fuel["total_fuel_l"],
                "distance_contribution": r.distance_nm,
                "weather_contribution": risk["components"]["weather"],
                "iceberg_contribution": risk["components"]["iceberg"],
            },
        }

    # sort: recommended first if present
    routes_sorted = sorted(routes, key=lambda r: (0 if r.name == "Recommended" else 1, r.distance_nm))
    return RouteOptimizeResponse(
        routes=[_route_to_dict(r) for r in routes_sorted],
        selected_mode=body.mode,
        weights_used=weights,
    )


def _choose_weights(mode: str) -> Dict[str, float]:
    from app.routing.route_optimizer import PRIORITY_MODES
    return PRIORITY_MODES.get(mode, PRIORITY_MODES["balanced"])


def _route_to_dict(r):
    return {
        "name": r.name,
        "distance_nm": r.distance_nm,
        "distance_km": r.distance_km,
        "estimated_hours": r.estimated_hours,
        "estimated_fuel_l": r.estimated_fuel_l,
        "risk_score": r.risk_score,
        "risk_label": r.risk_label,
        "waypoints": [
            {
                "lat": s["lat"],
                "lon": s["lon"],
                "distance_nm": s["distance_nm"],
                "ice_concentration": s["ice_concentration"],
                "iceberg_risk": s["iceberg_risk"],
                "weather_risk": s["weather_risk"],
                "wave_risk": s["wave_risk"],
                "current_assist": s["current_assist"],
            }
            for s in r.waypoints
        ],
        "explainability": r.explainability,
    }


# ---------------------------------------------------------------------------
# Data upload
# ---------------------------------------------------------------------------

@app.post("/api/data/upload", response_model=DataUploadResponse)
async def upload_data(file: UploadFile = File(...)):
    """Upload a CSV and return a data quality report.

    Accepted schemas are permissive: the service maps common column names to
    the internal normalized schema, detects missing values and invalid coords,
    and reports status.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported in this prototype.")
    try:
        contents = await read_file_contents(file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    try:
        df = pd.read_csv(io.StringIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    report = data_quality_report(df, dataset_name=file.filename)
    return DataUploadResponse(
        dataset=file.filename,
        rows=report["rows"],
        columns=report["columns"],
        missing_values_pct=report.get("missing_values_pct", 0.0),
        invalid_coordinates=report.get("invalid_coordinates", 0),
        date_range=report.get("date_range", ""),
        status=report.get("status", "unknown"),
        columns_received=list(df.columns),
    )


async def read_file_contents(file: UploadFile) -> str:
    return (await file.read()).decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Vessel config persistence (in-memory for prototype)
# ---------------------------------------------------------------------------

_vessel_store: Dict[str, Any] = {"current": _default_vessel().model_dump()}


@app.get("/api/vessel")
def get_vessel():
    return _vessel_store["current"]


@app.post("/api/vessel")
def set_vessel(body: VesselConfig):
    _vessel_store["current"] = body.model_dump()
    return body.model_dump()


# ---------------------------------------------------------------------------
# Demo scenario endpoint: run the full pipeline in one call
# ---------------------------------------------------------------------------

@app.post("/api/demo/run")
def demo_run(body: Optional[VesselConfig] = None):
    """Execute the full demo pipeline and return the complete result bundle."""
    v = body or _default_vessel()
    ts_dt = ANCHOR_TIMESTAMP
    env = _build_environment(ts=ts_dt)

    model_si = get_seaice_model()
    si_forecast = model_si.predict(v.start_lat, v.start_lon, ts_dt)

    model_ib = get_iceberg_model()
    icebergs = env["icebergs"]
    iceberg_preds = {ib["id"]: model_ib.predict(ib, ts_dt) for ib in icebergs}

    w = env["weather_map"].get((round(v.start_lat, 2), round(v.start_lon, 2)), {})
    o = env["ocean_map"].get((round(v.start_lat, 2), round(v.start_lon, 2)), {})

    # route
    weights = _choose_weights("balanced")
    grid = NavigationGrid(-78.0, -60.0, -180.0, 180.0, step_deg=0.5)
    grid.build(
        ice_grid=env["ice_grid"],
        icebergs=icebergs,
        ice_predictions=iceberg_preds,
        weather_map=env["weather_map"],
        ocean_map=env["ocean_map"],
        start_lat=v.start_lat,
        start_lon=v.start_lon,
        dest_lat=v.dest_lat,
        dest_lon=v.dest_lon,
    )
    vessel_dict = {
        "max_speed_knots": v.max_speed_knots,
        "fuel_capacity_l": v.fuel_capacity_l,
        "consumption_l_per_nm": v.consumption_l_per_nm,
        "ice_class": v.ice_class,
    }
    routes = generate_alternative_routes(
        grid, v.start_lat, v.start_lon, v.dest_lat, v.dest_lon, vessel_dict, weights
    )
    for r in routes:
        fuel = fuel_for_route({"distance_nm": r.distance_nm, "explainability": r.explainability}, vessel_dict)
        hours = estimate_time_hours({"distance_nm": r.distance_nm, "explainability": r.explainability}, vessel_dict)
        r.estimated_hours = hours
        r.estimated_fuel_l = fuel["total_fuel_l"]
        risk = composite_route_risk(r)
        r.risk_score = risk["score"]
        r.risk_label = risk["label"]
        r.explainability = {**r.explainability, **risk["components"], "fuel_breakdown": fuel, "estimated_hours": hours}

    routes_sorted = sorted(routes, key=lambda r: (0 if r.name == "Recommended" else 1, r.distance_nm))

    alerts = _build_alerts(env, v.start_lat, v.start_lon, v.dest_lat, v.dest_lon)

    return {
        "vessel": v.model_dump(),
        "timestamp": ts_dt.isoformat(),
        "environment": {
            "sea_ice_concentration": next((p["concentration"] for p in env["ice_grid"] if abs(p["lat"] - v.start_lat) < 1 and abs(p["lon"] - v.start_lon) < 5), 30.0),
            "weather": w,
            "ocean": o,
            "icebergs_nearby": [
                {
                    "id": ib["id"],
                    "distance_km": round(distance_nm(v.start_lat, v.start_lon, ib["lat"], ib["lon"]) * 1.852, 1),
                    "size": ib["size"],
                }
                for ib in icebergs
                if distance_nm(v.start_lat, v.start_lon, ib["lat"], ib["lon"]) < 200
            ],
        },
        "sea_ice_forecast": si_forecast,
        "icebergs": [
            {
                "id": ib["id"],
                "lat": ib["lat"],
                "lon": ib["lon"],
                "size": ib["size"],
                "predictions": iceberg_preds[ib["id"]],
            }
            for ib in icebergs
        ],
        "routes": [_route_to_dict(r) for r in routes_sorted],
        "alerts": alerts,
        "data_source": "synthetic/demo",
        "disclaimer": "Prototype demonstrator. Not for real navigation.",
    }


# ---------------------------------------------------------------------------
# Error handler for validation
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
