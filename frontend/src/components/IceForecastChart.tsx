import { SeaIceForecastPoint } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const RISK_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#f97316',
  'VERY HIGH': '#ef4444',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { risk: string } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0];
  const risk = pt.payload?.risk ?? 'UNKNOWN';
  return (
    <div className="bg-polar-900 border border-polar-700 rounded-lg p-2 text-xs shadow-lg">
      <div className="text-polar-500 mb-0.5">{label}</div>
      <div className="text-polar-200 font-semibold">{pt.value}%</div>
      <div className={`text-[10px] uppercase ${RISK_COLORS[risk] ?? 'text-polar-400'}`}>{risk}</div>
    </div>
  );
}

interface IceForecastChartProps {
  data: SeaIceForecastPoint[];
}

export default function IceForecastChart({ data }: IceForecastChartProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-polar-500 text-xs italic">
        No forecast data available.
      </div>
    );
  }

  // Build chart data with explicit x labels
  const chartData = data.map((p) => ({
    hours: p.hours,
    label: p.hours === 0 ? 'Now' : `+${p.hours}h`,
    concentration: p.concentration,
    risk: p.risk,
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={{ stroke: '#334155' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={{ stroke: '#334155' }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Line
            type="monotone"
            dataKey="concentration"
            stroke="#38bdf8"
            strokeWidth={2.5}
            dot={{ fill: '#38bdf8', r: 4, stroke: '#0a2935', strokeWidth: 1.5 }}
            activeDot={{ r: 6, fill: '#38bdf8', stroke: '#0a2935', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-polar-500 justify-center">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#38bdf8] mr-1" />Concentration</span>
        <span><span className="inline-block w-2.5 h-0.5 bg-[#f59e0b] mr-1" />Moderate threshold (50%)</span>
        <span><span className="inline-block w-2.5 h-0.5 bg-[#ef4444] mr-1" />High threshold (75%)</span>
      </div>
    </div>
  );
}
