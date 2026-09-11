const API = '';

/* ---------- types that mirror the real backend JSON shapes ---------- */

export interface UploadReport {
  dataset: string | null;
  rows: number | null;
  columns: string[];
  status: string;
  columns_received?: string[];
  date_range?: Record<string, string>;
  missing_values_pct?: number;
  invalid_coordinates?: number;
  error?: string;
}

export interface VesselConfig {
  name: string;
  start_lat: number;
  start_lon: number;
  dest_lat: number;
  dest_lon: number;
  max_speed_knots: number;
  fuel_capacity_l: number;
  consumption_l_per_nm: number;
  ice_class: string;
}

export interface SeaIceGridPoint {
  lat: number;
  lon: number;
  concentration: number;
  risk: string;
  timestamp: string;
}

export interface SeaIceForecastPoint {
  hours: number;
  timestamp: string;
  concentration: number;
  risk: string;
}

export interface Weather {
  lat: number;
  lon: number;
  timestamp: string;
  wind_kmh: number;
  wind_dir_deg: number;
  temperature_c: number;
  pressure_mb: number;
  visibility_km: number;
  precipitation_mm: number;
  wave_height_m: number;
  wave_dir_deg: number;
  storm: boolean;
}

export interface Ocean {
  lat: number;
  lon: number;
  timestamp: string;
  current_speed_ms: number;
  current_dir_deg: number;
  sst_c: number;
  salinity_psu: number;
  wave_height_m: number;
  depth_m: number;
}

export interface IcebergRecord {
  id: string;
  lat: number;
  lon: number;
  timestamp: string;
  speed_ms: number;
  direction_deg: number;
  size: string;
  height_m: number | null;
  predictions?: IcebergPrediction[];
  collision_risk?: number | null;
  data_source?: string;
}

export interface IcebergPrediction {
  hours: number;
  timestamp: string;
  lat: number;
  lon: number;
  speed_ms: number;
  direction_deg: number;
  uncertainty_km: number;
  confidence: number;
}

export interface Alert {
  id: string;
  level: string;
  category: string;
  title: string;
  message: string;
  recommended_action: string | null;
  timestamp: string;
}

export interface Route {
  name: string;
  distance_nm: number;
  distance_km: number;
  estimated_hours: number;
  estimated_fuel_l: number;
  risk_score: number;
  risk_label: string;
  waypoints: RouteWaypoint[];
  explainability: Record<string, unknown>;
}

export interface RouteWaypoint {
  lat: number;
  lon: number;
  distance_nm: number;
  ice_concentration: number;
  iceberg_risk: number;
  weather_risk: number;
  wave_risk: number;
  current_assist: number;
}

export interface IcebergDetail {
  id: string;
  lat: number;
  lon: number;
  timestamp: string;
  speed_ms: number;
  direction_deg: number;
  size: string;
  height_m: number | null;
  predictions?: IcebergPrediction[];
  collision_risk?: number | null;
  data_source?: string;
}

export interface DemoResult {
  vessel: VesselConfig;
  timestamp: string;
  environment: {
    sea_ice_concentration: number;
    weather: Weather;
    ocean: Ocean;
    icebergs_nearby: Array<{
      id: string;
      distance_km: number;
      size: string;
    }>;
  };
  sea_ice_forecast: SeaIceForecastPoint[];
  icebergs: IcebergRecord[];
  routes: Route[];
  alerts: Alert[];
  data_source: string;
  disclaimer: string;
}

/* ---------- api client ---------- */

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`API ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

export const api = {
  health: () =>
    apiFetch<{ status: string; service: string; version: string }>('/health'),

  info: () =>
    apiFetch<{ name: string; problem_statement: string; organization: string; features?: string[]; note?: string; disclaimer?: string }>(
      '/info',
    ),

  /** Sea-ice concentration at a single point (current). */
  seaIce: (lat: number, lon: number) =>
    apiFetch<{ lat: number; lon: number; concentration: number; risk: string; timestamp: string }>(
      `/api/sea-ice?lat=${lat}&lon=${lon}`,
    ),

  /** Full sea-ice grid (vector of grid cells). */
  seaIceGrid: () =>
    apiFetch<SeaIceGridPoint[]>('/api/sea-ice'),

  /** Sea-ice concentration forecast at a point for multiple horizons. */
  predictSeaIce: (body: { lat: number; lon: number; horizons?: number[] }) =>
    apiFetch<{ lat: number; lon: number; timestamp: string; forecast: SeaIceForecastPoint[]; data_source: string; note: string }>(
      '/api/sea-ice/predict',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),

  /** ML evaluation metrics for the sea-ice model. */
  seaIceEvaluation: () =>
    apiFetch<{ metrics: Record<string, unknown> }>('/api/sea-ice/evaluation'),

  /** Current iceberg tracks (with predictions baked in by the backend). */
  getIcebergs: () =>
    apiFetch<IcebergDetail[]>('/api/icebergs'),

  /** Iceberg trajectory forecast for one iceberg. */
  predictIceberg: (body: { id: string; lat: number; lon: number; timestamp: string; speed_ms: number; direction_deg: number; size: string; height_m?: number }) =>
    apiFetch<{ iceberg_id: string; predictions: IcebergPrediction[]; data_source: string; note: string }>(
      '/api/iceberg/predict',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),

  /** ML evaluation metrics for the iceberg trajectory model. */
  icebergEvaluation: () =>
    apiFetch<{ metrics: Record<string, unknown> }>('/api/iceberg/evaluation'),

  /** Weather at a point. */
  weather: (lat: number, lon: number) =>
    apiFetch<Weather>(`/api/weather?lat=${lat}&lon=${lon}`),

  /** Ocean conditions at a point. */
  ocean: (lat: number, lon: number) =>
    apiFetch<Ocean>(`/api/ocean?lat=${lat}&lon=${lon}`),

  /** Composite risk score at a point (0–100) + breakdown. */
  riskAtPoint: (lat: number, lon: number, dest_lat?: number, dest_lon?: number) =>
    apiFetch<{ score: number; label: string; components: Record<string, number>; recommended_action: string | null; timestamp: string }>(
      `/api/risk/at-point?lat=${lat}&lon=${lon}${dest_lat != null ? `&dest_lat=${dest_lat}&dest_lon=${dest_lon}` : ''}`,
    ),

  /** Full demo pipeline: environment + forecast + icebergs + routes + alerts. */
  demoRun: (vessel?: Partial<VesselConfig>) =>
    apiFetch<DemoResult>('/api/demo/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: vessel ? JSON.stringify(vessel) : undefined,
    }),

  /** Route optimization (single mode). */
  optimizeRoute: (body: { vessel: VesselConfig; mode?: string; weights?: Record<string, number> }) =>
    apiFetch<{ routes: Route[]; selected_mode: string; weights_used: Record<string, number> }>(
      '/api/route/optimize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),

  /** Upload a CSV and get a data-quality report. */
  uploadData: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<UploadReport>('/api/data/upload', { method: 'POST', body: form });
  },

  /** Current vessel config (persisted in-memory on backend). */
  getVessel: () => apiFetch<VesselConfig>('/api/vessel'),

  /** Persist vessel config on backend. */
  setVessel: (v: VesselConfig) =>
    apiFetch<VesselConfig>('/api/vessel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v),
    }),
};
