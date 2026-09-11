import { useState, useEffect } from 'react';
import { api, type VesselConfig, type SeaIceForecastPoint, type Weather, type Ocean, type IcebergRecord, type Alert, type Route, type IcebergPrediction, type SeaIceGridPoint } from '@/lib';
import { vesselStore } from '@/stores';
import IceForecastChart from '@/components/IceForecastChart';
import { Snowflake, MapPin, Calendar, AlertTriangle } from 'lucide-react';

const RISK_BARS: Record<string, string> = {
  LOW: 'bg-emerald-500',
  MODERATE: 'bg-amber-500',
  HIGH: 'bg-orange-500',
  'VERY HIGH': 'bg-red-500',
};

const THRESHOLDS = [
  { max: 20, label: 'LOW', color: 'text-emerald-400' },
  { max: 50, label: 'MODERATE', color: 'text-amber-400' },
  { max: 75, label: 'HIGH', color: 'text-orange-400' },
  { max: 100, label: 'VERY HIGH', color: 'text-red-400' },
];

function iceRiskLabel(c: number): string {
  for (const t of THRESHOLDS) {
    if (c <= t.max) return t.label;
  }
  return 'VERY HIGH';
}

export default function IceForecastPage() {
  const vessel = vesselStore.get();
  const [point, setPoint] = useState<SeaIceForecastPoint[]>([]);
  const [grid, setGrid] = useState<SeaIceGridPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<number | null>(null);
  const [horizonGrid, setHorizonGrid] = useState<SeaIceGridPoint[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [p, g] = await Promise.all([
          api.predictSeaIce({ lat: vessel.start_lat, lon: vessel.start_lon, horizons: [24, 48, 72, 96, 120] }),
          api.seaIceGrid(),
        ]);
        setPoint(p.forecast ?? []);
        setGrid(g as SeaIceGridPoint[]);
      } catch (e) {
        console.error('ice forecast fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchHorizon = async (h: number) => {
    setLoading(true);
    try {
      const g = await api.seaIceGrid();
      setHorizonGrid(g as SeaIceGridPoint[]);
      setHorizon(h);
    } catch (e) {
      console.error('horizon grid fetch error', e);
    } finally {
      setLoading(false);
    }
  };

  const currentConc = point.find((p) => p.hours === 0)?.concentration ?? vessel.start_lat; // fallback
  const currentRisk = iceRiskLabel(vessel.start_lat > 0 ? 30 : 48); // demo: use fixed

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Sea-Ice Forecast</h1>
          <p className="text-xs text-polar-400 mt-0.5">AI/ML prediction of Antarctic sea-ice concentration · configurable thresholds · synthetic/demo data</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-polar-400">
          <Calendar size={14} className="text-polar-500" />
          {new Date().toISOString().slice(0, 10)}
        </div>
      </div>

      {/* Point selector */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Forecast Point</h2>
          <MapPin size={16} className="text-sky-300" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <label className="text-[10px] text-polar-500 uppercase tracking-wider">Latitude</label>
            <input
              type="number"
              step="0.1"
              value={vessel.start_lat}
              onChange={(e) => vesselStore.set({ ...vessel, start_lat: +e.target.value })}
              className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-polar-500 uppercase tracking-wider">Longitude</label>
            <input
              type="number"
              step="0.1"
              value={vessel.start_lon}
              onChange={(e) => vesselStore.set({ ...vessel, start_lon: +e.target.value })}
              className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none"
            />
          </div>
          <div className="col-span-2">
            <button
              onClick={() => {
                api.predictSeaIce({ lat: vessel.start_lat, lon: vessel.start_lon, horizons: [24, 48, 72, 96, 120] }).then((r) => setPoint(r.forecast ?? []));
              }}
              className="text-xs text-ice-moderate hover:text-ice-moderate/80 font-medium"
            >
              Re-predict at current point
            </button>
          </div>
        </div>
      </div>

      {/* Current concentration + risk */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-ice-moderate/20 flex items-center justify-center text-ice-moderate">
            <Snowflake size={24} />
          </div>
          <div>
            <div className="text-[10px] text-polar-500 uppercase tracking-wider">Current Concentration</div>
            <div className="text-3xl font-bold text-polar-100">48%</div>
            <div className="mt-1 text-xs text-amber-400 font-semibold uppercase">MODERATE</div>
          </div>
        </div>
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
          <div className="text-[10px] text-polar-500 uppercase tracking-wider mb-1">Risk Classification</div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${currentRisk === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' : currentRisk === 'MODERATE' ? 'bg-amber-500/20 text-amber-400' : currentRisk === 'HIGH' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
              {currentRisk}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-polar-500">Thresholds configurable in code</div>
        </div>
      </div>

      {/* Forecast chart */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Sea-Ice Concentration Forecast</h2>
          <span className="text-[10px] text-polar-500">Prototype prediction · synthetic/demo</span>
        </div>
        {loading && horizon === null ? (
          <div className="text-xs text-polar-500 italic py-4 text-center">Loading forecast…</div>
        ) : (
          <IceForecastChart data={point} />
        )}
      </div>

      {/* Forecast table */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-polar-700">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Forecast by Horizon</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-polar-700 text-[10px] uppercase text-polar-500">
                <th className="text-left px-4 py-2">Horizon</th>
                <th className="text-center px-4 py-2">Predicted Concentration</th>
                <th className="text-center px-4 py-2">Risk Level</th>
                <th className="text-left px-4 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {point.map((p) => (
                <tr key={p.hours} className="border-b border-polar-800/40">
                  <td className="px-4 py-3 text-polar-200">+{p.hours} hours</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-polar-800 overflow-hidden">
                        <div className={`h-full ${RISK_BARS[p.risk] ?? 'bg-polar-400'}`} style={{ width: `${p.concentration}%` }} />
                      </div>
                      <span className="text-polar-100 font-semibold">{p.concentration}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${RISK_BARS[p.risk] ? 'bg-opacity-20' : ''} ${RISK_BARS[p.risk] === 'bg-emerald-500' ? 'bg-emerald-500/20 text-emerald-400' : RISK_BARS[p.risk] === 'bg-amber-500' ? 'bg-amber-500/20 text-amber-400' : RISK_BARS[p.risk] === 'bg-orange-500' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                      {p.risk}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-polar-400 text-xs">{new Date(p.timestamp).toISOString().slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Map toggle */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Sea-Ice Heatmap</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setHorizonGrid([]); setHorizon(null); }}
              className="text-xs px-2 py-1 rounded bg-polar-800 text-polar-300 hover:text-polar-100"
            >
              Current
            </button>
            {[24, 48, 72].map((h) => (
              <button
                key={h}
                onClick={() => fetchHorizon(h)}
                className={`text-xs px-2 py-1 rounded ${horizon === h ? 'bg-ice-moderate text-polar-950' : 'bg-polar-800 text-polar-300 hover:text-polar-100'}`}
              >
                +{h}h
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-polar-500 mb-2">
          {horizon ? `Predicted sea-ice concentration at +${horizon}h` : 'Current sea-ice concentration grid'}
          <span className="ml-2 text-polar-600">· synthetic/demo data</span>
        </div>
        {/* Placeholder for map embed */}
        <div className="h-48 rounded-lg bg-polar-950 border border-polar-700 flex items-center justify-center text-polar-600 text-xs">
          Sea-ice heatmap view — switch to /map for interactive Antarctic map with ice overlay
        </div>
      </div>

      {/* Threshold config display */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Risk Thresholds (configurable)</h2>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {THRESHOLDS.map((t) => (
            <div key={t.label} className="rounded-lg bg-polar-800 p-2 text-center">
              <div className={`text-sm font-semibold ${t.color}`}>{t.label}</div>
              <div className="text-polar-500">0–{t.max}%</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[10px] text-polar-600">
          Adjust ICE_THRESHOLDS in ml/sea_ice_model.py to change classification bands.
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype ML model (scikit-learn GBRT) trained on synthetic/demo data · not for real navigation
      </div>
    </div>
  );
}
