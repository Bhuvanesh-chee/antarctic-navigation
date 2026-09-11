import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface FloatingPanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

export default function FloatingPanel({ title, icon, children, onClose, className }: FloatingPanelProps) {
  return (
    <div className={`rounded-xl border border-polar-700 bg-polar-900 shadow-xl ${className ?? ''}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-polar-700">
        <div className="flex items-center gap-2">
          {icon && <span className="text-ice-moderate">{icon}</span>}
          <h3 className="text-sm font-semibold text-polar-200 uppercase tracking-wider">{title}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-polar-500 hover:text-polar-300 transition-colors">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
