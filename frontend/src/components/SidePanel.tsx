import { ReactNode } from 'react';

interface SidePanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function SidePanel({ title, icon, children, className }: SidePanelProps) {
  return (
    <div className={`rounded-xl border border-polar-700 bg-polar-900 p-4 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-ice-moderate">{icon}</span>}
        <h3 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}
