import { useState, useEffect } from 'react';
import { api, type VesselConfig, type Route, type Alert } from '@/lib';
import { vesselStore } from '@/stores';
import { ShieldAlert, Compass, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const RISK_BG: Record<string, string> = {
  'VERY LOW': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
  MODERATE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function componentBar(label: string, value: number, max = 100) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value < 20 ? 'bg-emerald-500' : value < 40 ? 'bg-green-500' : value < 60 ? 'bg-amber-500' : value < 80 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-polar-400 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-polar-800 overflow-hidden">
        <div className={color} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-polar-200 font-mono w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

export default function RiskPage() {
  const vessel = vesselStore.get();
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.riskAtPoint(vessel.start_lat, vessel.start_lon, vessel.dest_lat, vessel.dest_lon);
        setRisk(r);
        setAlerts([]);
      } catch (e) {
        console.error('risk fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const score = risk?.score as number | undefined;
  const label = risk?.label as string | undefined;
  const components = (risk?.components as Record<string, number>) ?? {};

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Navigation Risk Analysis</h1>
          <p className="text-xs text-polar-400 mt-0.5">Unified risk score from ice + iceberg + weather + wave + ocean + geographic · 0–100</p>
        </div>
      </div>

      {/* Overall risk */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Overall Navigation Risk</h2>
          <ShieldAlert size={20} className="text-amber-400" />
        </div>
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-polar-800" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${score ?? 0} 100`} className="text-ice-moderate" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-polar-100">{score ?? '—'}</div>
                <div className={`text-xs font-semibold uppercase ${RISK_BG[label ?? 'LOW']?.split(' ')[1] ?? 'text-polar-400'}`}>{label ?? '—'}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Vessel Position</div>
              <div className="text-polar-200 font-mono">{vessel.start_lat}°, {vessel.start_lon}°</div>
              <div className="text-[10px] text-polar-500">Destination: {vessel.dest_lat}°, {vessel.dest_lon}°</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-worthy">Risk band</div>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${RISK_BG[label ?? 'LOW']}`}>
                {label ?? '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Component breakdown */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="mb-3">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Risk Component Breakdown</h2>
          <div className="text-[10px] text-polar-600">Each component normalized 0–100; composite score is weighted sum</div>
        </div>
        <div className="space-y-2">
          {Object.entries(components).map(([k, v]) => (
            <div key={k}>{componentBar(k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), v)}</div>
          ))}
          {Object.keys(components).length === 0 && <div className="text-xs text-polar-500 italic py-2">No risk components available.</div>}
        </div>
        <div className="mt-3 text-[10px] text-polar-600 border-t border-polar-800 pt-2">
          Bands: 0–20 Very Low · 20–40 Low · 40–60 Moderate · 60–80 High · 80–100 Critical
        </div>
      </div>

      {/* Alerts */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-polar-700 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Active Alerts</h2>
          <span className="text-[10px] text-polar-500">{alerts.length} alerts</span>
        </div>
        <div className="divide-y divide-polar-800 max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-polar-500 italic">Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-polar-500 italic">No alerts.</div>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                {a.level === 'warning' ? <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" /> : a.level === 'danger' ? <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" /> : <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />}
                <div>
                  <div className="text-xs font-semibold text-polar-200">{a.title}</div>
                  <div className="text-[10px] text-polar-400 mt-0.5">{a.message}</div>
                  {a.recommended_action && (
                    <div className="mt-1 text-[10px] text-ice-moderate">→ {a.recommended_action}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype risk engine · synthetic/demo data
      </div>
    </div>
  );
}
