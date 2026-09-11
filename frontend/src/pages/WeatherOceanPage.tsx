import { useState, useEffect } from 'react';
import { api, type Weather, type Ocean } from '@/lib';
import { CloudSun, Wind, Thermometer, Gauge, Eye, Droplets, Waves, Compass, AlertTriangle } from 'lucide-react';

const RISK_COLOR: Record<string, string> = {
  LOW: 'text-emerald-400',
  MODERATE: 'text-amber-400',
  HIGH: 'text-orange-400',
  CRITICAL: 'text-red-400',
};

function weatherRiskLabel(w: Weather): string {
  if (w.storm) return 'CRITICAL';
  if (w.wind_kmh > 45 || w.wave_height_m > 3.5) return 'HIGH';
  if (w.wind_kmh > 25 || w.wave_height_m > 2.0) return 'MODERATE';
  return 'LOW';
}

export default function WeatherOceanPage() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [ocean, setOcean] = useState<Ocean | null>(null);
  const [loading, setLoading] = useState(true);
  const [lat, setLat] = useState(-68);
  const [lon, setLon] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [w, o] = await Promise.all([
          api.weather(lat, lon),
          api.ocean(lat, lon),
        ]);
        setWeather(w as Weather);
        setOcean(o as Ocean);
      } catch (e) {
        console.error('weather/ocean fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [lat, lon]);

  const wr = weather ? weatherRiskLabel(weather) : 'LOW';

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-polar-100 tracking-tight">Weather & Oceanographic Module</h1>
          <p className="text-xs text-polar-400 mt-0.5">Meteorological and ocean conditions · risk scoring · prototype</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-polar-400">
          <CloudSun size={14} className="text-sky-300" />
          <span className="text-polar-500">{weather ? weather.timestamp.slice(0, 10) : '—'}</span>
        </div>
      </div>

      {/* point selector */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-polar-500 uppercase tracking-wider">Latitude</label>
            <input type="number" step="0.1" value={lat} onChange={(e) => setLat(+e.target.value)} className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-polar-500 uppercase tracking-wider">Longitude</label>
            <input type="number" step="0.1" value={lon} onChange={(e) => setLon(+e.target.value)} className="w-full mt-1 bg-polar-800 border border-polar-700 rounded px-2 py-1.5 text-sm text-polar-200 focus:border-ice-moderate outline-none" />
          </div>
          <div className="col-span-2 text-xs text-polar-500">
            <button onClick={() => { setLat(-68); setLon(0); }} className="text-ice-moderate hover:text-ice-moderate/80">Reset to vessel position</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Weather */}
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Meteorological Conditions</h2>
            {weather && <span className={`text-xs font-semibold uppercase ${RISK_COLOR[wr]}`}>{wr}</span>}
          </div>
          {loading ? (
            <div className="text-xs text-polar-500 italic py-4 text-center">Loading…</div>
          ) : weather ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Wind size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Wind speed</span><div className="text-polar-200 font-medium">{weather.wind_kmh} km/h</div></div></div>
                <div className="flex items-center gap-2"><Compass size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Wind direction</span><div className="text-polar-200 font-medium">{weather.wind_dir_deg}°</div></div></div>
                <div className="flex items-center gap-2"><Thermometer size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Temperature</span><div className="text-polar-200 font-medium">{weather.temperature_c}°C</div></div></div>
                <div className="flex items-center gap-2"><Gauge size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Pressure</span><div className="text-polar-200 font-medium">{weather.pressure_mb} mb</div></div></div>
                <div className="flex items-center gap-2"><Eye size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Visibility</span><div className="text-polar-200 font-medium">{weather.visibility_km} km</div></div></div>
                <div className="flex items-center gap-2"><Droplets size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Precipitation</span><div className="text-polar-200 font-medium">{weather.precipitation_mm} mm</div></div></div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle size={14} className={weather.storm ? 'text-red-400' : 'text-polar-600'} />
                <span className={weather.storm ? 'text-red-400 font-semibold uppercase' : 'text-polar-500'}>{weather.storm ? '⚠ STORM CONDITION' : 'No storm'}</span>
              </div>
              <div className="text-[10px] text-polar-600">Weather risk score: {wr} · derived from wind, wave, storm, visibility, temperature</div>
            </div>
          ) : (
            <div className="text-xs text-polar-500 italic py-4 text-center">Weather data unavailable.</div>
          )}
        </div>

        {/* Ocean */}
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Oceanographic Conditions</h2>
            <Compass size={16} className="text-sky-300" />
          </div>
          {loading ? (
            <div className="text-xs text-polar-500 italic py-4 text-center">Loading…</div>
          ) : ocean ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Compass size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Current speed</span><div className="text-polar-200 font-medium">{ocean.current_speed_ms} m/s</div></div></div>
                <div className="flex items-center gap-2"><Wind size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Current direction</span><div className="text-polar-200 font-medium">{ocean.current_dir_deg}°</div></div></div>
                <div className="flex items-center gap-2"><Thermometer size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Sea-surface temp</span><div className="text-polar-200 font-medium">{ocean.sst_c}°C</div></div></div>
                <div className="flex items-center gap-2"><Gauge size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Salinity</span><div className="text-polar-200 font-medium">{ocean.salinity_psu} PSU</div></div></div>
                <div className="flex items-center gap-2"><Waves size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Wave height</span><div className="text-polar-200 font-medium">{ocean.wave_height_m} m</div></div></div>
                <div className="flex items-center gap-2"><Gauge size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Water depth</span><div className="text-polar-200 font-medium">{ocean.depth_m} m</div></div></div>
              </div>
              <div className="text-xs text-polar-500 mt-2">
                Favorable current (eastward) reduces effective fuel cost; opposing current increases it.
                Current direction is used in route optimization.
              </div>
            </div>
          ) : (
            <div className="text-xs text-polar-500 italic py-4 text-center">Ocean data unavailable.</div>
          )}
        </div>
      </div>

      {/* weather time-series placeholder */}
      <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Recent Weather Trend (schematic)</h2>
        </div>
        <div className="h-24 rounded-lg bg-polar-950 border border-polar-700 flex items-center justify-center text-polar-600 text-xs">
          Time-series weather chart — wind / temperature / wave height (recharts integration — wire to real 시계열 endpoint)
        </div>
      </div>

      <div className="text-[10px] text-polar-600 border-t border-polar-800 pt-2 flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-amber-500" />
        Prototype weather/ocean module · synthetic/demo data
      </div>
    </div>
  );
}
