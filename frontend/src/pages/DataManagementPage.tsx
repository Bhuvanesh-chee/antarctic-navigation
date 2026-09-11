import { useState, useEffect, useRef } from 'react';
import { api, type UploadReport } from '@/lib';
import { Database, Upload, FileText, CheckCircle, XCircle } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  ready: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  usable_with_caution: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  needs_cleaning: 'text-red-400 bg-red-500/10 border-red-500/20',
  pending: 'text-polar-400 bg-polar-800 border-polar-600',
};

export default function DataManagementPage() {
  const [report, setReport] = useState<UploadReport | null>(null);
  const [uploads, setUploads] = useState<Array<Record<string, unknown>>>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setReport({ dataset: file.name, status: 'needs_cleaning', missing_values_pct: 0, invalid_coordinates: 0, rows: 0, columns: [], date_range: {}, columns_received: [] });
      return;
    }
    setLoading(true);
    try {
      const r = await api.uploadData(file);
      setReport(r);
      setUploads((prev) => [{ ...r, uploaded_at: new Date().toISOString() }, ...prev]);
    } catch (e) {
      setReport({ dataset: file.name, status: 'needs_cleaning', error: String(e), missing_values_pct: 0, invalid_coordinates: 0, rows: 0, columns: [], date_range: {}, columns_received: [] });
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const triggerUpload = () => fileInputRef.current?.click();

  return (
    <div className="space-y-4 max-w-[1100px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Data Management</h1>
          <p className="text-xs text-polar-400 mt-0.5">CSV upload · data validation · quality report · synthetic/demo data generator</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={triggerUpload}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${dragOver ? 'border-ice-moderate bg-ice-moderate/5' : 'border-polar-700 bg-polar-900'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="hidden"
          id="csv-upload"
        />
        <Upload size={28} className={dragOver ? 'text-ice-moderate' : 'text-polar-600'} />
        <div className="mt-2 text-sm text-polar-400">
          {dragOver ? 'Drop CSV here' : 'Drag & drop a CSV file, or click to browse'}
        </div>
        <div className="mt-1 text-[10px] text-polar-600">
          Accepted: sea_ice.csv, iceberg.csv, weather.csv, ocean.csv, vessel_route.csv
        </div>
      </div>

      {/* Uploads history */}
      {uploads.length > 0 && (
        <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-polar-700">
            <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Upload History</h2>
          </div>
          <div className="divide-y divide-polar-800 max-h-[180px] overflow-y-auto">
            {uploads.map((u, i) => (
              <div key={i} className="px-4 py-2 text-xs flex items-center justify-between">
                <span className="text-polar-200 font-mono">{(u.dataset as string) ?? '—'}</span>
                <span className="text-polar-500">{(u.rows as number) ?? 0} rows · {(u.status as string) ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current report */}
      {report && (
        <div className="rounded-xl border border-polar-700 bg-polar-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-polar-700 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Data Quality Report</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[(report.status as string) ?? 'pending']}`}>
              {(report.status as string) ?? '—'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 text-sm">
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Dataset</div>
              <div className="text-polar-200 font-mono text-lg">{String(report.dataset ?? '—')}</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Rows</div>
              <div className="text-polar-200 font-mono text-lg">{String(report.rows ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Missing Values</div>
              <div className="text-polar-200 font-mono">{String(report.missing_values_pct ?? 0)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Invalid Coords</div>
              <div className="text-polar-200 font-mono">{String(report.invalid_coordinates ?? 0)}</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Date Range</div>
              <div className="text-polar-200">{String(report.date_range ?? '—')}</div>
            </div>
            <div>
              <div className="text-[10px] text-polar-500 uppercase tracking-wider">Columns</div>
              <div className="text-polar-200">{String(report.columns ?? 0)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-polar-500 uppercase tracking-wider mb-1">Columns Received</div>
              <div className="flex flex-wrap gap-1">
                {(report.columns_received as string[])?.map((c) => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-polar-800 text-polar-300">{c}</span>
                ))}
              </div>
            </div>
          </div>
          {report.status === 'ready' && (
            <div className="px-4 py-2 border-t border-polar-700 text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle size={14} /> Dataset ready for processing.
            </div>
          )}
        </div>
      )}

      {/* Synthetic data generator */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Synthetic / Demo Data</h2>
          <Database size={16} className="text-sky-300" />
        </div>
        <div className="text-xs text-polar-400 mb-3">
          The prototype includes a synthetic data generator that produces realistic-looking Antarctic sea-ice grids,
          iceberg tracks, weather, and ocean data. This is clearly labelled <span className="text-amber-400 font-semibold">DEMO / SYNTHETIC DATA</span>
          and is NOT official NCPOR data. Real datasets can be uploaded via CSV to replace the synthetic data.
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded bg-polar-800 p-3 text-center">
            <div className="text-polar-500">Sea-Ice Grid</div>
            <div className="text-polar-200 font-semibold mt-1">2.0° × 5.0° cells</div>
          </div>
          <div className="rounded bg-polar-800 p-3 text-center">
            <div className="text-polar-500">Icebergs</div>
            <div className="text-polar-200 font-semibold mt-1">18 tracked</div>
          </div>
          <div className="rounded bg-polar-800 p-3 text-center">
            <div className="text-polar-500">Weather/Ocean</div>
            <div className="text-polar-200 font-semibold mt-1">Sampled grid</div>
          </div>
          <div className="rounded bg-polar-800 p-3 text-center">
            <div className="text-polar-500">Timestamp</div>
            <div className="text-polar-200 font-semibold mt-1">2024-08-01</div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype data pipeline · CSV upload validates columns, missing values, and invalid coordinates
      </div>
    </div>
  );
}
