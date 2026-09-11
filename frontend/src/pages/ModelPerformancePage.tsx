import { useState, useEffect } from 'react';
import { api } from '@/lib';
import { BarChart3, Snowflake, Mountain } from 'lucide-react';

export default function ModelPerformancePage() {
  const [iceMetrics, setIceMetrics] = useState<Record<string, unknown> | null>(null);
  const [icebergMetrics, setIcebergMetrics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ice, ib] = await Promise.all([
          api.seaIceEvaluation(),
          api.icebergEvaluation(),
        ]);
        setIceMetrics(ice.metrics ?? null);
        setIcebergMetrics(ib.metrics ?? null);
      } catch (e) {
        console.error('metrics fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Model Performance</h1>
          <p className="text-xs text-polar-400 mt-0.5">ML evaluation metrics · sea-ice forecast model · iceberg trajectory model</p>
        </div>
      </div>

      {/* Sea-ice model */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Snowflake size={16} className="text-ice-moderate" />
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Sea-Ice Concentration Model</h2>
          </div>
          <span className="text-[10px] text-polar-500">scikit-learn GBRT · prototype</span>
        </div>
        {loading ? (
          <div className="text-xs text-polar-500 italic py-4 text-center">Loading metrics…</div>
        ) : iceMetrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">MAE</div>
              <div className="text-polar-100 font-mono text-xl">{(iceMetrics.mae as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">concentration %</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">RMSE</div>
              <div className="text-polar-100 font-mono text-xl">{(iceMetrics.rmse as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">concentration %</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">R²</div>
              <div className="text-polar-100 font-mono text-xl">{(iceMetrics.r2 as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">coefficient of determination</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Samples</div>
              <div className="text-polar-100 font-mono text-xl">{(iceMetrics.n_samples as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">synthetic demo data</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-polar-500 italic py-4 text-center">Metrics unavailable.</div>
        )}
        <div className="mt-3 text-[10px] text-amber-400 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-amber-500" />
          Evaluation performed on synthetic/demo data. Do not treat as operational accuracy.
        </div>
      </div>

      {/* Iceberg model */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mountain size={16} className="text-sky-300" />
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Iceberg Trajectory Model</h2>
          </div>
          <span className="text-[10px] text-polar-500">drift + GBRT residual · prototype</span>
        </div>
        {loading ? (
          <div className="text-xs text-polar-500 italic py-4 text-center">Loading metrics…</div>
        ) : icebergMetrics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">MAE Lat Residual</div>
              <div className="text-polar-100 font-mono text-xl">{(icebergMetrics.mae_lat_residual_deg as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">degrees</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">MAE Lon Residual</div>
              <div className="text-polar-100 font-mono text-xl">{(icebergMetrics.mae_lon_residual_deg as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">degrees</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Approx Dist Error</div>
              <div className="text-polar-100 font-mono text-xl">{(icebergMetrics.approx_distance_error_km as number) ?? '—'} km</div>
              <div className="text-[10px] text-polar-500">estimated position error</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Samples</div>
              <div className="text-polar-100 font-mono text-xl">{(icebergMetrics.n_samples as number) ?? '—'}</div>
              <div className="text-[10px] text-polar-500">synthetic demo data</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-polar-500 italic py-4 text-center">Metrics unavailable.</div>
        )}
        <div className="mt-3 text-[10px] text-amber-400 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-amber-500" />
          Evaluation performed on synthetic/demo data. Do not treat as operational accuracy.
        </div>
      </div>

      {/* Methodology */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">ML Methodology</h2>
          <BarChart3 size={14} className="text-sky-300" />
        </div>
        <div className="text-xs text-polar-400 space-y-2">
          <p><span className="text-polar-300 font-medium">Sea-Ice Model:</span> Gradient-boosted regressor (scikit-learn) trained on synthetic features (lat, lon, seasonal phase, air temp, SST, wind speed/direction, current speed/direction). Forecasts are produced by projecting features forward in time. This is a demonstration baseline.</p>
          <p><span className="text-polar-300 font-medium">Iceberg Model:</span> Physics-inspired drift model (current + wind drift coupling) with a learned residual corrector (two small GBRTs for lat/lon residuals). Uncertainty grows with horizon.</p>
          <p><span className="text-polar-300 font-medium">Data:</span> All training and evaluation use synthetic/demo data. The pipeline is modular so real datasets can be plugged in later via CSV upload.</p>
        </div>
      </div>

      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Synthetic/demo evaluation metrics · not operational accuracy
      </div>
    </div>
  );
}
