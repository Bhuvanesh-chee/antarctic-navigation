import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type VesselConfig, type Route } from '@/lib';
import { vesselStore } from '@/stores';
import FloatingPanel from '@/components/FloatingPanel';
import { Ship } from 'lucide-react';

const PRIORITIES = [
  { value: 'balanced', label: 'Balanced / Recommended' },
  { value: 'safety', label: 'Safety Priority' },
  { value: 'fuel', label: 'Fuel Priority' },
  { value: 'speed', label: 'Speed Priority' },
];

const RISK_COLOR: Record<string, string> = {
  'VERY LOW': 'text-emerald-400',
  LOW: 'text-green-400',
  MODERATE: 'text-amber-400',
  HIGH: 'text-orange-400',
  CRITICAL: 'text-red-400',
};

export default function RoutePlannerPage() {
  const nav = useNavigate();
  const vessel = vesselStore.get();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [priority, setPriority] = useState('balanced');
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [explain, setExplain] = useState<Route | null>(null);

  const run = async () => {
    setLoading(true);
    setRoutes([]);
    setExplain(null);
    try {
      const res = await api.optimizeRoute({
        vessel,
        mode: priority,
        weights: weights ?? undefined,
      });
      setRoutes(res.routes ?? []);
      setWeights(res.weights_used ?? null);
    } catch (e) {
      console.error('route optimize failed', e);
    } finally {
      setLoading(false);
    }
  };

  const selected = routes.find((r) => r.name === 'Recommended') ?? routes[0] ?? null;

  return (
    <div className="space-y-4 max-w-[1500px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Route Planner</h1>
          <p className="text-xs text-polar-400 mt-0.5">A* / Dijkstra over cost grid · configurable weights · three candidate routes</p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ice-moderate text-polar-950 text-sm font-semibold hover:bg-ice-moderate/90 disabled:opacity-50"
        >
          <Ship size={16} />
          {loading ? 'Optimizing…' : 'Generate Safe Route'}
        </button>
      </div>

      {/* Priority + weights */}
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex items-center gap-3">
          <span className="text-xs text-polar-400 uppercase tracking-wider">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="bg-polar-800 border border-polar-700 rounded-lg px-3 py-1.5 text-sm text-polar-200 outline-none focus:border-ice-moderate"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        {weights && (
          <div className="flex items-center gap-3 text-xs text-polar-400">
            <span>Weights:</span>
            {Object.entries(weights).map(([k, v]) => (
              <span key={k} className="px-2 py-0.5 rounded bg-polar-800 text-polar-300">{k}: {Math.round(v * 100)}%</span>
            ))}
          </div>
        )}
      </div>

      {/* Vessel config */}
      <FloatingPanel
        title="Vessel Configuration"
        icon={<Ship size={16} />}
        onClose={() => {}}
        className="sm:max-w-md"
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Name</label>
              <input
                value={vessel.name}
                onChange={(e) => vesselStore.set({ ...vessel, name: e.target.value })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Max Speed (kn)</label>
              <input
                type="number"
                value={vessel.max_speed_knots}
                onChange={(e) => vesselStore.set({ ...vessel, max_speed_knots: +e.target.value || 1 })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Fuel Capacity (L)</label>
              <input
                type="number"
                value={vessel.fuel_capacity_l}
                onChange={(e) => vesselStore.set({ ...vessel, fuel_capacity_l: +e.target.value || 1 })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Consumption (L/nm)</label>
              <input
                type="number"
                step="0.1"
                value={vessel.consumption_l_per_nm}
                onChange={(e) => vesselStore.set({ ...vessel, consumption_l_per_nm: +e.target.value || 1 })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Start Lat</label>
              <input
                type="number"
                step="0.1"
                value={vessel.start_lat}
                onChange={(e) => vesselStore.set({ ...vessel, start_lat: +e.target.value })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Start Lon</label>
              <input
                type="number"
                step="0.1"
                value={vessel.start_lon}
                onChange={(e) => vesselStore.set({ ...vessel, start_lon: +e.target.value })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Dest Lat</label>
              <input
                type="number"
                step="0.1"
                value={vessel.dest_lat}
                onChange={(e) => vesselStore.set({ ...vessel, dest_lat: +e.target.value })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-polar-500 uppercase tracking-wider">Dest Lon</label>
              <input
                type="number"
                step="0.1"
                value={vessel.dest_lon}
                onChange={(e) => vesselStore.set({ ...vessel, dest_lon: +e.target.value })}
                className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-polar-400">Ice class:</span>
            <select
              value={vessel.ice_class}
              onChange={(e) => vesselStore.set({ ...vessel, ice_class: e.target.value })}
              className="bg-polar-800 border border-polar-700 rounded px-2 py-1 text-sm text-polar-200 outline-none"
            >
              <option value="Ice-capable">Ice-capable</option>
              <option value="PC4">PC4</option>
              <option value="PC5">PC5</option>
              <option value="Non ice-strengthened">Non ice-strengthened</option>
            </select>
          </div>
          <button
            onClick={() => { vesselStore.reset(); run(); }}
            className="text-xs text-ice-moderate hover:text-ice-moderate/80"
          >
            Reset to demo defaults
          </button>
        </div>
      </FloatingPanel>

      {/* Route comparison table */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-polar-700 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Route Comparison</h2>
          {routes.length > 0 && (
            <span className="text-[10px] text-polar-500">{routes.length} routes generated</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-polar-700 text-[10px] uppercase text-polar-500">
                <th className="text-left px-4 py-2 font-medium">Route</th>
                <th className="text-right px-4 py-2 font-medium">Distance</th>
                <th className="text-right px-4 py-2 font-medium">Time</th>
                <th className="text-right px-4 py-2 font-medium">Fuel</th>
                <th className="text-right px-4 py-2 font-medium">Risk</th>
                <th className="text-right px-4 py-2 font-medium w-24">Select</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-polar-500 italic">
                    No routes yet. Configure vessel and destination, then click "Generate Safe Route".
                  </td>
                </tr>
              ) : (
                routes.map((r) => (
                  <tr
                    key={r.name}
                    className={`border-b border-polar-800/60 hover:bg-polar-800/40 ${selected?.name === r.name ? 'bg-ice-moderate/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-polar-200">{r.name}</span>
                        {r.name === 'Recommended' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-ice-moderate/20 text-ice-moderate">RECOMMENDED</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-polar-200">{r.distance_km} km</td>
                    <td className="px-4 py-3 text-right text-polar-200">{r.estimated_hours} h</td>
                    <td className="px-4 py-3 text-right text-sky-300 font-medium">{r.estimated_fuel_l >= 1000 ? `${(r.estimated_fuel_l/1000).toFixed(1)}k L` : `${Math.round(r.estimated_fuel_l)} L`}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${RISK_COLOR[r.risk_label] ?? 'text-polar-400'}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {r.risk_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (r.waypoints.length) {
                            setExplain(r);
                            nav('/map');
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded ${r.name === 'Recommended' ? 'bg-ice-moderate/20 text-ice-moderate' : 'text-polar-400 hover:text-polar-200'}`}
                        disabled={!r.waypoints.length}
                      >
                        View on map
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explainability */}
      {explain && (
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Route Explainability — {explain.name}</h2>
            <button onClick={() => setExplain(null)} className="text-xs text-polar-500 hover:text-polar-300">Hide</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs text-polar-400 font-medium uppercase tracking-wider">Why this route was selected</div>
              <ul className="space-y-1.5 text-xs">
                {explain.explainability ? (
                  <>
                    <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5 shrink-0">✓</span><span>Average sea-ice concentration: {(explain.explainability.avg_ice_concentration as number) ?? '—'}%</span></li>
                    <li><span className="text-emerald-400 mt-0.5 shrink-0">✓</span><span>Iceberg exposure: {riskLabelText(explain.explainability.iceberg_contribution as number)}</span></li>
                    <li><span className="text-emerald-400 mt-0.5 shrink-0">✓</span><span>Weather risk: {explain.explainability.weather_contribution as number ?? '—'}/100</span></li>
                    <li><span className="text-sky-300 mt-0.5 shrink-0">✓</span><span>Ocean current assist: {explain.explainability.avg_current_assist as number ?? '—'}</span></li>
                    <li className="flex items-start gap-2"><span className="text-amber-300 mt-0.5 shrink-0">✓</span><span>Travel distance: {explain.distance_km ?? '—'} km</span></li>
                    <li className="flex items-start gap-2"><span className="text-sky-300 mt-0.5 shrink-0">✓</span><span>Estimated fuel: {formatFuel(explain.estimated_fuel_l)}</span></li>
                  </>
                ) : (
                  <li className="text-polar-500 italic">No explainability data.</li>
                )}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-polar-400 font-medium uppercase tracking-wider">Contribution breakdown</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {explain.explainability?.modes_compared ? (
                  Object.entries(explain.explainability.modes_compared as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="rounded bg-polar-800 p-2">
                      <div className="text-polar-500 capitalize">{k.replace(/_/g, ' ')}</div>
              <div className="text-polar-100 font-semibold">{typeof v === 'number' ? (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(1)) : String(v ?? '—')}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-polar-500 italic col-span-2">No breakdown data.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype A* routing · synthetic/demo data · not for real navigation
      </div>
    </div>
  );
}

function riskLabelText(v: unknown): string {
  if (typeof v !== 'number') return '—';
  if (v < 20) return 'Very low';
  if (v < 40) return 'Low';
  if (v < 60) return 'Moderate';
  if (v < 80) return 'High';
  return 'Critical';
}

function formatFuel(l: number): string {
  return l >= 1000 ? `${(l/1000).toFixed(1)}k L` : `${Math.round(l)} L`;
}
