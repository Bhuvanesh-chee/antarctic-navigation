import { useState, useEffect } from 'react';
import { api, type IcebergRecord, type IcebergPrediction } from '@/lib';
import { Mountain, Wind, Compass, Ship, Clock } from 'lucide-react';

export default function IcebergPage() {
  const [icebergs, setIcebergs] = useState<IcebergRecord[]>([]);
  const [selected, setSelected] = useState<IcebergRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [collisions, setCollisions] = useState<Array<{ id: string; distance_km: number; risk: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getIcebergs();
        setIcebergs(data);
        // collision check: for each iceberg, predict +24/+48 and compare to vessel dest
        const near = data.slice(0, 6).map((ib) => {
          const pred24 = ib.predictions?.find((p) => p.hours === 24);
          const dist = pred24 ? distKm(ib.lat, ib.lon, pred24.lat, pred24.lon) : null;
          return {
            id: ib.id,
            distance_km: dist ?? Infinity,
            risk: dist && dist < 50 ? 'HIGH' : dist && dist < 100 ? 'MODERATE' : 'LOW',
          };
        });
        setCollisions(near);
      } catch (e) {
        console.error('iceberg fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const distKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const riskColor = (r: string) => r === 'HIGH' ? 'text-red-400' : r === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400';

  const handleIcebergClick = (ib: IcebergRecord) => {
    setSelected(ib);
    // Trigger trajectory prediction for this iceberg
    api.predictIceberg({
      id: ib.id,
      lat: ib.lat,
      lon: ib.lon,
      timestamp: ib.timestamp,
      speed_ms: ib.speed_ms,
      direction_deg: ib.direction_deg,
      size: ib.size,
      height_m: ib.height_m ?? undefined,
    }).then((res) => {
      // Update the selected iceberg's predictions in place via a local refresh
      setIcebergs(prev => prev.map(x => x.id === ib.id ? { ...x, predictions: res.predictions } : x));
    }).catch(() => {});
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Iceberg Tracking & Trajectory</h1>
          <p className="text-xs text-polar-400 mt-0.5">Iceberg positions · predicted trajectories · collision risk · synthetic/demo data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* List */}
        <div className="xl:col-span-1 space-y-3">
          <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-polar-700 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Iceberg Registry</h2>
              <span className="text-[10px] text-polar-500">{icebergs.length} tracked</span>
            </div>
            <div className="divide-y divide-polar-800 max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="px-4 py-8 text-center text-xs text-polar-500 italic">Loading iceberg data…</div>
              ) : icebergs.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-polar-500 italic">No iceberg data available.</div>
              ) : (
                icebergs.map((ib) => (
                  <button
                    key={ib.id}
                    onClick={() => setSelected(ib)}
                    className={`w-full text-left px-4 py-3 hover:bg-polar-800/40 transition-colors ${selected?.id === ib.id ? 'bg-ice-moderate/10 border-l-2 border-ice-moderate' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-sky-300">{ib.id}</span>
                      <span className="text-[10px] uppercase text-polar-500">{ib.size}</span>
                    </div>
                    <div className="mt-1 text-xs text-polar-400">
                      {ib.lat}°, {ib.lon}° · {ib.speed_ms} m/s · {ib.direction_deg}°
                    </div>
                    <div className="mt-1 text-[10px] text-polar-600">
                      Height: {ib.height_m != null ? `${ib.height_m}` : '—'} m · Predictions: {ib.predictions?.length ?? 0} horizons
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          {/* Collision risk summary */}
          <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
            <div className="text-xs font-semibold text-polar-400 uppercase tracking-wider mb-3">Collision Risk Summary</div>
            <div className="space-y-2">
              {collisions.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-sky-300">{c.id}</span>
                  <span className={riskColor(c.risk) + ' font-semibold uppercase'}>{c.risk}</span>
                  <span className="text-polar-400">{c.distance_km === Infinity ? '—' : `${Math.round(c.distance_km)} km`}</span>
                </div>
              ))}
              {collisions.length === 0 && <div className="text-xs text-polar-500 italic">No collision data.</div>}
            </div>
          </div>
        </div>

        {/* Detail / trajectory */}
        <div className="xl:col-span-2 space-y-4">
          {selected ? (
            <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">{selected.id} — Trajectory Prediction</h2>
                <button onClick={() => setSelected(null)} className="text-xs text-polar-500 hover:text-polar-300">Clear</button>
              </div>

              {/* current info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                <div><span className="text-[10px] text-polar-500 uppercase">Latitude</span><div className="text-polar-100 font-medium">{selected.lat}°</div></div>
                <div><span className="text-[10px] text-polar-500 uppercase">Longitude</span><div className="text-polar-100 font-medium">{selected.lon}°</div></div>
                <div><span className="text-[10px] text-polar-500 uppercase">Speed</span><div className="text-polar-100 font-medium">{selected.speed_ms} m/s</div></div>
                <div><span className="text-[10px] text-polar-500 uppercase">Direction</span><div className="text-polar-100 font-medium">{selected.direction_deg}°</div></div>
              </div>

              {/* trajectory viz */}
              <div className="rounded-lg bg-polar-950 border border-polar-700 p-3">
                <div className="text-[10px] text-polar-500 mb-2">Trajectory visualization (schematic)</div>
                <div className="relative h-40 bg-polar-900 flex items-center justify-center">
                  <div className="w-full h-full relative">
                    {/* historical */}
                    <div className="absolute left-1/2 top-3/4 transform -translate-x-1/2">
                      <div className="w-6 h-0.5 bg-slate-500 rounded mb-1" />
                      <div className="w-4 h-0.5 bg-slate-500 rounded mb-1" />
                      <div className="w-2 h-0.5 bg-slate-500 rounded" />
                      <div className="text-[9px] text-slate-500 mt-1 text-center">Historical</div>
                    </div>
                    {/* current marker */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 rounded-full bg-sky-400 border-2 border-sky-300 flex items-center justify-center text-[8px] text-polar-950 font-bold">●</div>
                      <div className="text-[9px] text-sky-300 mt-1 text-center">Current</div>
                    </div>
                    {/* predicted path */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2" style={{ bottom: '10%' }}>
                      <div className="w-20 h-0.5 bg-red-500/60 rounded" />
                      <div className="w-14 h-0.5 bg-red-500/40 rounded" />
                      <div className="w-8 h-0.5 bg-red-500/20 rounded" />
                      <div className="text-[9px] text-red-400 mt-1 text-center">Predicted path</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* predictions table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-polar-700 text-[10px] uppercase text-polar-500">
                      <th className="text-left px-3 py-2">Horizon</th>
                      <th className="text-left px-3 py-2">Predicted Lat</th>
                      <th className="text-left px-3 py-2">Predicted Lon</th>
                      <th className="text-left px-3 py-2">Uncertainty</th>
                      <th className="text-left px-3 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.predictions?.map((p) => (
                      <tr key={p.hours} className="border-b border-polar-800/30">
                        <td className="px-3 py-2 text-polar-200 font-mono">+{p.hours} h</td>
                        <td className="px-3 py-2 text-polar-100 font-mono">{p.lat}°</td>
                        <td className="px-3 py-2 text-polar-100 font-mono">{p.lon}°</td>
                        <td className="px-3 py-2 text-polar-400">±{p.uncertainty_km} km</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 rounded bg-polar-800 overflow-hidden">
                              <div className="h-full bg-ice-moderate" style={{ width: `${p.confidence}%` }} />
                            </div>
                            <span className="text-polar-300 font-medium">{p.confidence}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* note */}
              <div className="mt-3 text-[10px] text-polar-600 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                Prototype prediction model · labelled synthetic/demo · confidence grows with horizon
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-polar-700 bg-polar-900 p-8 text-center">
              <Mountain size={32} className="mx-auto text-polar-600 mb-3" />
              <p className="text-sm text-polar-400">Select an iceberg from the registry to view trajectory predictions.</p>
            </div>
          )}
        </div>
      </div>

      {/* disclaimer */}
      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Synthetic/demo data · not for real navigation
      </div>
    </div>
  );
}
