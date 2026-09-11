import { useState, useEffect } from 'react';
import { api } from '@/lib';
import { themeState } from '@/stores';
import { Settings, Sun, Moon, Globe, AlertTriangle } from 'lucide-react';

const RISK_THRESHOLDS = [
  { max: 20, label: 'LOW', color: 'text-emerald-400' },
  { max: 50, label: 'MODERATE', color: 'text-amber-400' },
  { max: 75, label: 'HIGH', color: 'text-orange-400' },
  { max: 100, label: 'VERY HIGH', color: 'text-red-400' },
];

export default function SettingsPage() {
  const [health, setHealth] = useState<{ status?: string; service?: string; version?: string } | null>(null);
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [h, i] = await Promise.all([api.health(), api.info()]);
        setHealth(h as { status?: string; service?: string; version?: string });
        setInfo(i as Record<string, unknown>);
      } catch (e) {
        console.error('settings fetch error', e);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4 max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">System Settings</h1>
          <p className="text-xs text-polar-400 mt-0.5">Configuration · API status · disclaimers</p>
        </div>
      </div>

      {/* System status */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">System Status</h2>
          {checking ? (
            <span className="text-xs text-polar-500">Checking…</span>
          ) : health ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {(health as Record<string, unknown>).status as string ?? 'ok'}
            </span>
          ) : (
            <span className="text-xs text-red-400">Unreachable</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-polar-500">Service</span><div className="text-polar-200">{health?.service ?? '—'}</div></div>
          <div><span className="text-polar-500">Version</span><div className="text-polar-200">{health?.version ?? '—'}</div></div>
          <div><span className="text-polar-500">Problem Statement</span><div className="text-polar-200">26059</div></div>
          <div><span className="text-polar-500">Organization</span><div className="text-polar-200">MoES / NCPOR</div></div>
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Display Theme</h2>
          <button
            onClick={() => themeState.set(themeState.get() === 'dark' ? 'light' : 'dark')}
            className="text-xs px-3 py-1.5 rounded-lg bg-polar-800 text-polar-300 hover:text-polar-100 border border-polar-700"
          >
            {themeState.get() === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
        </div>
        <div className="text-xs text-polar-400">
          Current: <span className="text-polar-200 font-medium">{themeState.get() === 'dark' ? 'Dark' : 'Light'}</span> · preference saved locally
        </div>
      </div>

      {/* Risk thresholds */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Ice Risk Thresholds</h2>
          <Globe size={14} className="text-sky-300" />
        </div>
        <div className="text-[10px] text-polar-500 mb-2">Configurable in backend code (ml/sea_ice_model.py · ICE_THRESHOLDS)</div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {RISK_THRESHOLDS.map((t) => (
            <div key={t.label} className="rounded bg-polar-800 p-2 text-center">
              <div className={t.color}>{t.label}</div>
              <div className="text-polar-500">0–{t.max}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimers */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Prototype Disclaimers</h2>
        </div>
        <div className="space-y-2 text-xs text-polar-400">
          <p><span className="text-amber-400 font-semibold">DEMO / SYNTHETIC DATA:</span> This prototype uses synthetic/demo data unless real datasets are uploaded via CSV. Never represent synthetic data as official NCPOR data.</p>
          <p><span className="text-amber-400 font-semibold">NOT FOR REAL NAVIGATION:</span> This system is a prototype concept demonstrator and is NOT certified for real-world vessel navigation. Do not use for operational decisions.</p>
          <p><span className="text-amber-400 font-semibold">ML EVALUATION:</span> All ML metrics are computed on synthetic/demo data. Do not treat as operational accuracy.</p>
          <p><span className="text-amber-400 font-semibold">MODULAR DESIGN:</span> The system is designed so real datasets can be plugged in later without changing the UI.</p>
        </div>
      </div>

      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype configuration · no API keys stored in frontend
      </div>
    </div>
  );
}
