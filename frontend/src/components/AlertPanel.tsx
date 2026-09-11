import { Alert } from '@/lib/api';

interface AlertPanelProps {
  alert: Alert;
}

const LEVEL_STYLE: Record<string, string> = {
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  danger: 'text-red-400 bg-red-500/10 border-red-500/20',
  info: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
};

export default function AlertPanel({ alert }: AlertPanelProps) {
  const cls = LEVEL_STYLE[alert.level] ?? 'text-polar-400 bg-polar-800 border-polar-600';
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs font-semibold text-polar-200 mb-0.5">{alert.title}</div>
      <div className="text-[11px] text-polar-400 leading-relaxed mb-1">{alert.message}</div>
      {alert.recommended_action && (
        <div className="text-[10px] text-ice-moderate">→ {alert.recommended_action}</div>
      )}
    </div>
  );
}
