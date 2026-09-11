import { useState, useEffect } from 'react';
import { api, type Weather, type Ocean, type IcebergRecord, type Alert, type SeaIceForecastPoint, type Route } from '@/lib/api';

/**
 * useEnvironment: fetches the full demo environment on mount (or re-fetch).
 *
 * Backwards-compatible shape:
 *   grid       -> sea_ice_forecast (renamed; each point has hours/concentration/risk)
 *   gridH24    -> subset for +24h (filtered)
 *   icebergs   -> real iceberg records with predictions
 *   alerts     -> hazard alerts
 */
export function useEnvironment() {
  const [forecast, setForecast] = useState<SeaIceForecastPoint[]>([]);
  const [forecastH24, setForecastH24] = useState<SeaIceForecastPoint[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [ocean, setOcean] = useState<Ocean | null>(null);
  const [icebergs, setIcebergs] = useState<IcebergRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.demoRun();
        if (cancelled) return;
        setWeather(r.environment?.weather ?? null);
        setOcean(r.environment?.ocean ?? null);
        setIcebergs(r.icebergs ?? []);
        setAlerts(r.alerts ?? []);
        setForecast(r.sea_ice_forecast ?? []);
        setTs(r.timestamp ?? '');
        // +24h subset
        const h24 = (r.sea_ice_forecast ?? []).filter((p) => p.hours === 24);
        setForecastH24(h24);
      } catch (e) {
        if (!cancelled) console.error('useEnvironment fetch error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { grid: forecast, gridH24: forecastH24, weather, ocean, icebergs, alerts, iceForecast: forecast, loading, ts };
}

export function useRoute(mode: string = 'balanced', weights?: Record<string, number>) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedMode, setSelectedMode] = useState(mode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (v: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.optimizeRoute({ vessel: v, mode, weights });
      setRoutes(res.routes ?? []);
      setSelectedMode(res.selected_mode ?? mode);
    } catch (e) {
      setError(String(e));
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  };

  return { routes, selectedMode, loading, error, run, setMode: (m: string) => { setSelectedMode(m); }, setWeights: () => {} };
}

export function useIceForecast(lat: number, lon: number) {
  const [forecast, setForecast] = useState<SeaIceForecastPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await api.predictSeaIce({ lat, lon, horizons: [24, 48, 72, 96, 120] });
      setForecast(res.forecast ?? []);
    } catch {
      setForecast([]);
    } finally {
      setLoading(false);
    }
  };

  return { forecast, loading, run, setLatLon: () => {} };
}
