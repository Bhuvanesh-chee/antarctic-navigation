import { ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
  icon?: ReactNode;
  href?: string;
  className?: string;
}

export default function KPICard({ label, value, subtext, color = 'text-polar-200', icon, href, className }: KPICardProps) {
  const inner = (
    <div className={`rounded-xl border border-polar-700 bg-polar-900 p-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-polar-500 uppercase tracking-wider font-semibold">{label}</span>
        {icon && <span className={color}>{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtext && <div className="mt-1 text-xs text-polar-400">{subtext}</div>}
    </div>
  );

  return href ? (
    <a href={href} className="block outline-none">{inner}</a>
  ) : (
    inner
  );
}
