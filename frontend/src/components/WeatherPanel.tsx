import { Weather, Ocean } from '@/lib/api';
import { Wind, Thermometer, Gauge, Eye, Droplets, Waves, Compass } from 'lucide-react';

interface WeatherPanelProps {
  weather: Weather;
  ocean?: Ocean;
}

export default function WeatherPanel({ weather, ocean }: WeatherPanelProps) {
  const stormBadge = weather.storm
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-red-500/20 text-red-400 border border-red-500/30"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Storm</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Safe</span>;

  return (
    <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">Weather Snapshot</h2>
        {stormBadge}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div className="flex items-center gap-2"><Wind size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Wind</span><div className="text-polar-200 font-medium">{weather.wind_kmh} km/h</div></div></div>
        <div className="flex items-center gap-2"><Thermometer size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Temp</span><div className="text-polar-200 font-medium">{weather.temperature_c}°C</div></div></div>
        <div className="flex items-center gap-2"><Gauge size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Pressure</span><div className="text-polar-200 font-medium">{weather.pressure_mb} mb</div></div></div>
        <div className="flex items-center gap-2"><Eye size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Visibility</span><div className="text-polar-200 font-medium">{weather.visibility_km} km</div></div></div>
        <div className="flex items-center gap-2"><Droplets size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Precip.</span><div className="text-polar-200 font-medium">{weather.precipitation_mm} mm</div></div></div>
        <div className="flex items-center gap-2"><Waves size={14} className="text-sky-300" /><div><span className="text-[10px] text-polar-500">Wave</span><div className="text-polar-200 font-medium">{weather.wave_height_m} m</div></div></div>
      </div>
      {ocean && (
        <div className="mt-3 pt-3 border-t border-polar-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-polar-400 uppercase tracking-wider">Ocean Conditions</h3>
            <Compass size={12} className="text-sky-300" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1.5"><Compass size={12} className="text-sky-300" /><span>Current: {ocean.current_speed_ms} m/s · {ocean.current_dir_deg}°</span></div>
            <div className="flex items-center gap-1.5"><Thermometer size={12} className="text-sky-300" /><span>SST: {ocean.sst_c}°C</span></div>
            <div className="flex items-center gap-1.5"><Gauge size={12} className="text-sky-300" /><span>Salinity: {ocean.salinity_psu} PSU</span></div>
          </div>
        </div>
      )}
      <div className="mt-2 text-[10px] text-polar-600 flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full bg-amber-500" />Synthetic/demo weather/ocean
      </div>
    </div>
  );
}
