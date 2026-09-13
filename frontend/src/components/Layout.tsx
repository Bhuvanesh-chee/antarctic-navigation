import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, Snowflake, Mountain, CloudSun, Route,
  ShieldAlert, Database, BarChart3, Settings, Sun, Moon, AlertTriangle,
} from 'lucide-react';
import { themeState } from '@/stores';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/map', label: 'Antarctic Map', icon: Map },
  { to: '/sea-ice', label: 'Sea-Ice Forecast', icon: Snowflake },
  { to: '/icebergs', label: 'Iceberg Tracking', icon: Mountain },
  { to: '/weather-ocean', label: 'Weather & Ocean', icon: CloudSun },
  { to: '/route', label: 'Route Planner', icon: Route },
  { to: '/risk', label: 'Risk Analysis', icon: ShieldAlert },
  { to: '/data', label: 'Data Management', icon: Database },
  { to: '/model-performance', label: 'Model Performance', icon: BarChart3 },
  { to: '/settings', label: 'System Settings', icon: Settings },
];

export default function Layout({ children }: { children?: React.ReactNode }) {
  const loc = useLocation();
  const [dark, setDark] = useState(themeState.get() === 'dark');
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    themeState.set(next);
    setDark(!dark);
  };

  return (
    <div className={`flex h-screen overflow-hidden ${dark ? 'dark' : ''}`} data-theme={dark ? 'dark' : 'light'}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-polar-700 bg-polar-900 flex flex-col">
        <div className="px-5 py-5 border-b border-polar-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-ice-moderate flex items-center justify-center text-polar-950 font-bold text-sm">
              AI
            </div>
            <div>
              <div className="text-xs text-polar-400 font-medium uppercase tracking-wider">MoES / NCPOR</div>
              <div className="text-sm text-polar-100 font-semibold leading-tight">Antarctic NSDSS</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-polar-500 leading-tight">
            Smart India Hackathon · PS-26059
          </div>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-ice-moderate/20 text-ice-moderate border-l-2 border-ice-moderate'
                      : 'text-polar-400 hover:text-polar-200 hover:bg-polar-800'
                  }`
                }
              >
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-polar-700 flex items-center justify-between">
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-polar-400 hover:text-polar-200 hover:bg-polar-800 transition-colors"
            title={dark ? 'Switch to light' : 'Switch to dark'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="text-[10px] text-polar-500">Prototype</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-11 flex-shrink-0 border-b border-polar-700 bg-polar-900/80 backdrop-blur flex items-center justify-between px-4 text-xs text-polar-400">
          <div className="flex items-center gap-3">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="uppercase tracking-wider font-medium">Decision Support System</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-ice-moderate/10 text-ice-moderate border border-ice-moderate/20">
              DEMO / SYNTHETIC DATA
            </span>
            <span className="text-polar-600">|</span>
            <span className="text-polar-500">Not for real navigation</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 bg-polar-950">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
