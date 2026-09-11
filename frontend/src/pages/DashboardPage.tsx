import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type DemoResult,
  type Route,
  type Alert,
  type Weather,
  type Ocean,
  type IcebergRecord,
  type SeaIceForecastPoint,
  type VesselConfig,
  type IcebergPrediction,
} from '@/lib';
import { vesselStore } from '@/stores';
import KPICard from '@/components/KPICard';
import AlertPanel from '@/components/AlertPanel';
import WeatherPanel from '@/components/WeatherPanel';
import IceForecastChart from '@/components/IceForecastChart';
import { Snowflake, Ship, Compass, Wind, Waves, Thermometer } from 'lucide-react';

const RISK_COLOR: Record<string, string> = {
  'VERY LOW': 'text-emerald-400',
  LOW: 'text-green-400',
  MODERATE: 'text-amber-400',
  HIGH: 'text-orange-400',
  'VERY HIGH': 'text-red-400',
  CRITICAL: 'text-red-500',
};

function riskBadge(label: string) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${RISK_COLOR[label] ?? 'text-polar-400'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const vessel = vesselStore.get();
  const [result, setResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [clickedIceberg, setClickedIceberg] = useState<{ id: string; lat: number; lon: number; size: string; predictions: SeaIceForecastPoint[] } | null>(null);
  const [seaIceChart, setSeaIceChart] = useState<SeaIceForecastPoint[]>([]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.demoRun(vessel);
      setResult(r);
      setSeaIceChart(r.sea_ice_forecast ?? []);
      const ib0 = r.icebergs[0];
      if (ib0) {
        setClickedIceberg({
          id: ib0.id,
          lat: ib0.lat,
          lon: ib0.lon,
          size: ib0.size,
          predictions: ib0.predictions as unknown as SeaIceForecastPoint[],
        });
      } else {
        setClickedIceberg(null);
      }
    } catch (e) {
      console.error('demo run failed', e);
    } finally {
      setLoading(false);
    }
  }, [vessel]);

  useEffect(() => {
    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const env = result?.environment;
  const seaIce = env?.sea_ice_concentration ?? 48;
  const weather = env?.weather as Weather | undefined;
  const ocean = env?.ocean as Ocean | undefined;
  const routes = result?.routes ?? [];
  const recommended = routes.find((r) => r.name === 'Recommended') ?? routes[0] ?? null;
  const alerts = result?.alerts ?? [];

  const iceClassColor = vessel.ice_class.toLowerCase().includes('ice') ? 'text-sky-300' : 'text-amber-400';

  return (
    <div className="space-y-4 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-polar-400 mt-0.5">
            Antarctic Navigation Decision Support System · {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ice-moderate text-polar-950 text-sm font-semibold hover:bg-ice-moderate/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Snowflake size={16} />
            {loading ? 'Analyzing…' : 'Analyze Environment'}
          </button>
        </div>
      </div>

      {/* Vessel quick info */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-polar-300"><Ship size={14} className="text-sky-300" /><span>{vessel.name}</span></div>
        <div className="text-polar-600">|</div>
        <div className="flex items-center gap-1.5 text-polar-300"><Compass size={14} /><span>{vessel.start_lat}°, {vessel.start_lon}° → {vessel.dest_lat}°, {vessel.dest_lon}°</span></div>
        <div className="text-polar-600">|</div>
        <div className="flex items-center gap-1.5 text-polar-300"><Thermometer size={14} className="text-sky-300" /><span className={iceClassColor}>{vessel.ice_class}</span></div>
        <div className="text-polar-600">|</div>
        <div className="flex items-center gap-1.5 text-polar-300"><Wind size={14} /><span>{maxSpeedLabel(vessel.max_speed_knots)}</span></div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Sea Ice" value={`${Math.round(seaIce)}%`} subtext={riskForIce(seaIce)} color="ice-moderate" icon={<Snowflake size={20} />} href="/sea-ice" />
        <KPICard label="Iceberg Risk" value="—" subtext={icebergRiskLabel(env)} icon={<Compass size={20} />} href="/icebergs" />
        <KPICard label="Weather" value={weather ? weatherTemp(weather) : '—'} subtext={weather ? (weather.storm ? '⚠ STORM' : 'SAFE') : '—'} color={weather?.storm ? 'text-amber-400' : 'text-emerald-400'} icon={<Wind size={20} />} href="/weather-ocean" />
        <KPICard label="Wave Height" value={ocean || weather ? (ocean?.wave_height_m ?? weather?.wave_height_m ?? '—') + ' m' : '—'} subtext="Ocean state" icon={<Waves size={20} />} href="/weather-ocean" />
        <KPICard label="Route Risk" value={recommended ? `${Math.round(recommended.risk_score)}/100` : '—'} subtext={recommended ? recommended.risk_label : '—'} color={riskColor(recommended)} icon={<Compass size={20} className="text-amber-300" />} href="/route" />
        <KPICard label="Fuel Estimate" value={recommended ? formatFuel(recommended.estimated_fuel_l) : '—'} subtext={recommended ? `${recommended.estimated_hours} h` : '—'} color="text-sky-300" icon={<Ship size={20} />} href="/route" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Alerts */}
        <div className="xl:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Alerts & Notifications</h2>
            <span className="text-[10px] text-polar-500">{alerts.length} active</span>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="text-xs text-polar-500 italic py-4 text-center">No alerts at this time.</div>
            ) : (
              alerts.map((a) => <AlertPanel key={a.id} alert={a} />)
            )}
          </div>
          {/* Recommended route summary */}
          {recommended && (
            <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
              <div className="text-xs uppercase tracking-wider text-polar-400 mb-2 font-semibold">Recommended Route</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-ice-moderate">{recommended.name}</span>
                <span className="text-xs text-polar-500">{recommended.distance_km} km · {recommended.estimated_hours} h</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-polar-400">Risk:</span>
                {riskBadge(recommended.risk_label)}
                <span className="text-polar-500 ml-2">Fuel: {formatFuel(recommended.estimated_fuel_l)}</span>
              </div>
              <button
                onClick={() => nav('/route')}
                className="mt-3 text-xs text-ice-moderate hover:text-ice-moderate/80 font-medium"
              >
                Compare routes & explainability →
              </button>
            </div>
          )}
        </div>

        {/* Charts / predictions */}
        <div className="xl:col-span-2 space-y-4">
          {/* Sea-ice forecast chart */}
          <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Sea-Ice Concentration Forecast</h2>
              <span className="text-[10px] text-polar-500">Prototype prediction · synthetic data</span>
            </div>
            <IceForecastChart data={seaIceChart} />
          </div>
          {/* Weather snapshot */}
          {weather && (
            <WeatherPanel weather={weather} ocean={ocean} />
          )}
          {/* Quick ice forecast table */}
          <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Ice Forecast at Vessel Position</h2>
              <span className="text-[10px] text-polar-600">{vessel.start_lat}°, {vessel.start_lon}°</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {seaIceChart.slice(0, 5).map((p) => (
                <div key={p.hours} className="rounded-lg bg-polar-800 p-2">
                  <div className="text-polar-500">+{p.hours}h</div>
                  <div className="text-lg font-bold text-polar-100">{p.concentration}%</div>
                  <div className={`text-[10px] uppercase ${RISK_COLOR[p.risk] ?? ''}`}>{p.risk}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype demonstrator · synthetic/demo data · not certified for real-world vessel navigation
      </div>
    </div>
  );
}

function maxSpeedLabel(knots: number) {
  return `${knots} kn · ${(knots * 1.852).toFixed(0)} km/h`;
}

function riskForIce(c: number): string {
  if (c <= 20) return 'LOW';
  if (c <= 50) return 'MODERATE';
  if (c <= 75) return 'HIGH';
  return 'VERY HIGH';
}

function icebergRiskLabel(env: { icebergs_nearby?: Array<{ id: string; distance_km: number; size: string }> } | undefined): string {
  const nearby = env?.icebergs_nearby ?? [];
  if (nearby.length === 0) return 'LOW';
  const minDist = Math.min(...nearby.map((i) => i.distance_km));
  if (minDist < 20) return 'HIGH';
  if (minDist < 50) return 'MODERATE';
  return 'LOW';
}

function weatherTemp(w: Weather): string {
  return `${Math.round(w.temperature_c)}°C`;
}

function riskColor(r: Route | null): string {
  if (!r) return 'text-polar-400';
  const s = r.risk_score;
  if (s < 20) return 'text-emerald-400';
  if (s < 40) return 'text-green-400';
  if (s < 60) return 'text-amber-400';
  if (s < 80) return 'text-orange-400';
  return 'text-red-400';
}

function formatFuel(l: number): string {
  return l >= 1000 ? `${(l / 1000).toFixed(1)}k L` : `${Math.round(l)} L`;
}
