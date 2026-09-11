import { type VesselConfig } from '@/lib';

function defaultVessel(): VesselConfig {
  return {
    name: 'Polar Research Vessel 01',
    start_lat: -68.0,
    start_lon: 0.0,
    dest_lat: -72.0,
    dest_lon: 10.0,
    max_speed_knots: 14.0,
    fuel_capacity_l: 50000,
    consumption_l_per_nm: 25.0,
    ice_class: 'Ice-capable',
  };
}

const STORAGE_KEY = 'antarctic_vessel_cfg';

function persist(v: VesselConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
}

function load(): VesselConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VesselConfig;
  } catch {
    return null;
  }
}

let _vessel = load() ?? defaultVessel();

export const vesselStore = {
  get: () => (_vessel ? { ..._vessel } : defaultVessel()),
  set: (v: VesselConfig) => { _vessel = { ...v }; persist(v); },
  reset: () => { _vessel = defaultVessel(); persist(_vessel); },
};

export { defaultVessel };