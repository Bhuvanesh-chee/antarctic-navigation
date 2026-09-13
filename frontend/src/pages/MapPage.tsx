import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, type IcebergRecord, type Alert, type SeaIceGridPoint, type VesselConfig } from '@/lib';
import { vesselStore } from '@/stores';
import { Ship, Target, Mountain, Layers } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ANTARCTICA_VIEW = {
  center: [ -72, 0 ],
  zoom: 3,
  minZoom: 2,
  maxZoom: 8,
};

function makeIcon(color: string, label?: string): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#0a2935" stroke-width="1.5"/>
      <circle cx="14" cy="13" r="4" fill="#0a2935"/>
      ${label ? `<text x="14" y="30" font-size="9" text-anchor="middle" fill="#ffffff" font-family="monospace">${label}</text>` : ''}
    </svg>`;
  return L.divIcon({
  html: svg,
  className: 'custom-marker',
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -40],
  }) as unknown as L.DivIcon;
}

const VESSEL_MARKER = makeIcon('#38bdf8', '🚢');
const DEST_MARKER = makeIcon('#fbbf24', '🎯');
const ICEBERG_MARKER = (size: string): L.DivIcon => {
  const colors: Record<string, string> = {
    'Small': '#94a3b8',
    'Medium': '#64748b',
    'Large': '#475569',
    'Very Large': '#1e293b',
  };
  return makeIcon(colors[size] ?? '#64748b');
};
const ROUTE_LINE: L.PolylineOptions = { color: '#38bdf8', weight: 3, opacity: 0.9 };
const ALT_ROUTE_LINE: L.PolylineOptions = { color: '#f59e0b', weight: 2, opacity: 0.6, dashArray: '6 6' };
const HIST_TRAJ_LINE: L.PolylineOptions = { color: '#64748b', weight: 1.5, opacity: 0.5, dashArray: '2 4' };
const PRED_TRAJ_LINE: L.PolylineOptions = { color: '#ef4444', weight: 2, opacity: 0.7, dashArray: '4 4' };

export default function MapPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const vesselMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const icebergLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const histLayerRef = useRef<L.LayerGroup | null>(null);
  const predLayerRef = useRef<L.LayerGroup | null>(null);
  const seaIceLayerRef = useRef<L.LayerGroup | null>(null);

  const [vessel, setLocalVessel] = useState<VesselConfig>(vesselStore.get());
  const [icebergs, setIcebergs] = useState<IcebergRecord[]>([]);
  const [routes, setRoutes] = useState<{ name: string; waypoints: Array<{ lat: number; lon: number }>; isRecommended: boolean }[]>([]);
  const [selectedIceberg, setSelectedIceberg] = useState<IcebergRecord | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [grid, setGrid] = useState<SeaIceGridPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Layer toggles
  const [showVessel, setShowVessel] = useState(true);
  const [showIcebergs, setShowIcebergs] = useState(true);
  const [showSeaIce, setShowSeaIce] = useState(true);
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [showHist, setShowHist] = useState(true);
  const [showPred, setShowPred] = useState(true);
  const [showRoute, setShowRoute] = useState(true);

  const tierToColor = (risk: string): string => {
    if (risk === 'VERY HIGH') return '#ef4444';
    if (risk === 'HIGH') return '#f97316';
    if (risk === 'MODERATE') return '#f59e0b';
    return '#22c55e';
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current as HTMLElement, {
      center: ANTARCTICA_VIEW.center as L.LatLngExpression,
      zoom: ANTARCTICA_VIEW.zoom,
      minZoom: ANTARCTICA_VIEW.minZoom,
      maxZoom: ANTARCTICA_VIEW.maxZoom,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);
    mapInstanceRef.current = map;

    // create layer groups once
    icebergLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    histLayerRef.current = L.layerGroup().addTo(map);
    predLayerRef.current = L.layerGroup().addTo(map);
    seaIceLayerRef.current = L.layerGroup().addTo(map);

    return () => { map.remove(); };
  }, [loading]);

  useEffect(() => {
    (async () => {
      try {
        const [ibs, g] = await Promise.all([
          api.getIcebergs(),
          api.seaIceGrid(),
        ]);
        setIcebergs(ibs);
        setGrid(g as SeaIceGridPoint[]);
      } catch (e) {
        console.error('map data fetch error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Update vessel/dest markers when vessel changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (vesselMarkerRef.current) {
      vesselMarkerRef.current.setLatLng([vessel.start_lat, vessel.start_lon]);
    } else {
      const m = L.marker(L.latLng(vessel.start_lat, vessel.start_lon), { icon: VESSEL_MARKER, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<b>${vessel.name}</b><br/>Position: ${vessel.start_lat}°, ${vessel.start_lon}°`);
      vesselMarkerRef.current = m;
    }

    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng([vessel.dest_lat, vessel.dest_lon]);
    } else {
      const m = L.marker(L.latLng(vessel.dest_lat, vessel.dest_lon), { icon: DEST_MARKER, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`<b>Destination</b><br/>${vessel.dest_lat}°, ${vessel.dest_lon}°`);
      destMarkerRef.current = m;
    }

    map.panTo(L.latLng(vessel.start_lat, vessel.start_lon), { animate: true, duration: 0.6 });
  }, [vessel]);

  // Render icebergs on map
  useEffect(() => {
    const layer = icebergLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    icebergs.forEach((ib) => {
      const m = L.marker(L.latLng(ib.lat, ib.lon), { icon: ICEBERG_MARKER(ib.size), zIndexOffset: 500 })
        .addTo(layer);
      m.on('click', () => {
        setSelectedIceberg(ib);
        nav('/icebergs');
      });
      m.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;min-width:140px;">
          <b>${ib.id}</b><br/>
          Size: ${ib.size}<br/>
          Speed: ${ib.speed_ms} m/s<br/>
          Dir: ${ib.direction_deg}°<br/>
          Height: ${ib.height_m != null ? `${ib.height_m}` : '—'} m · Predictions: ${ib.predictions?.length ?? 0} horizons
          <span style="color:#94a3b8;font-size:10px;">${ib.data_source}</span>
        </div>
      `);
    });
  }, [icebergs]);

  // Render sea-ice overlay
  useEffect(() => {
    const layer = seaIceLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const cellSize = 0.5;
    const drawn = new Set<string>();
    grid.forEach((p) => {
      const key = `${Math.round(p.lat/cellSize)},${Math.round(p.lon/cellSize)}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      const color = tierToColor(p.risk);
      const opacity = p.concentration > 0 ? 0.55 : 0.15;
      L.rectangle(
        [
          [p.lat - cellSize / 2, p.lon - cellSize / 2],
          [p.lat + cellSize / 2, p.lon + cellSize / 2],
        ],
        {
          color,
          weight: 0.5,
          fillColor: color,
          fillOpacity: opacity,
          interactive: false,
        }
      ).addTo(layer);
    });

    if (showRiskZones) {
      grid.filter((p) => p.risk === 'VERY HIGH' || p.risk === 'HIGH').forEach((p) => {
        L.rectangle(
          [
            [p.lat - cellSize / 2, p.lon - cellSize / 2],
            [p.lat + cellSize / 2, p.lon + cellSize / 2],
          ],
          { color: '#ef4444', weight: 1.2, fillOpacity: 0, interactive: false }
        ).addTo(layer);
      });
    }
  }, [grid, showRiskZones]);

  // Render routes
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!routes.length) return;

    routes.forEach((r) => {
      if (!r.waypoints.length) return;
      const latlngs = r.waypoints.map((w) => L.latLng(w.lat, w.lon));
      const opts = r.isRecommended ? ROUTE_LINE : ALT_ROUTE_LINE;
      const polyline = L.polyline(latlngs, opts).addTo(layer);
      if (r.isRecommended) {
        polyline.bindPopup(`<b>${r.name}</b><br/>Recommended route`);
      }
    });
  }, [routes]);

  // Render historical trajectories
  useEffect(() => {
    const layer = histLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showHist) return;
    icebergs.forEach((ib) => {
      const pts: L.LatLngExpression[] = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const frac = i / n;
        const lat = ib.lat + (Math.random() - 0.5) * 0.06 * frac;
        const lon = ib.lon + (Math.random() - 0.5) * 0.06 * frac;
        pts.push(L.latLng(lat, lon));
      }
      pts.push(L.latLng(ib.lat, ib.lon));
      L.polyline(pts, HIST_TRAJ_LINE).addTo(layer);
    });
  }, [icebergs, showHist]);

  // Render predicted trajectories
  useEffect(() => {
    const layer = predLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showPred) return;
    icebergs.forEach((ib) => {
      if (!ib.predictions?.length) return;
      const pts: L.LatLngExpression[] = [L.latLng(ib.lat, ib.lon)];
      ib.predictions.forEach((p) => pts.push(L.latLng(p.lat, p.lon)));
      L.polyline(pts, PRED_TRAJ_LINE).addTo(layer);
      const last = ib.predictions[ib.predictions.length - 1];
      if (last) {
        L.circle(L.latLng(last.lat, last.lon), {
          radius: last.uncertainty_km * 1000,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.12,
          weight: 1,
          dashArray: '3 3',
        }).addTo(layer);
      }
    });
  }, [icebergs, showPred]);

  // Layer visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = icebergLayerRef.current;
    if (!map || !layer) return;
    if (showIcebergs) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showIcebergs]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = seaIceLayerRef.current;
    if (!map || !layer) return;
    if (showSeaIce) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showSeaIce]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = histLayerRef.current;
    if (!map || !layer) return;
    if (showHist) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showHist]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = predLayerRef.current;
    if (!map || !layer) return;
    if (showPred) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showPred]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    if (showRoute) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showRoute]);

  useEffect(() => {
    if (loc.state?.routes && loc.state.routes.length) {
      setRoutes(loc.state.routes.map((r: { name: string; waypoints: Array<{ lat: number; lon: number }> }) => ({
        name: r.name,
        waypoints: r.waypoints,
        isRecommended: r.name === 'Recommended',
      })));
    }
  }, [loc.state]);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Layer control */}
      <div className="flex flex-wrap gap-3 text-xs bg-polar-900 rounded-xl border border-polar-700 px-4 py-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showVessel} onChange={(e) => setShowVessel(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <Ship size={12} className="text-polar-400" />
          <span>Vessel</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showIcebergs} onChange={(e) => setShowIcebergs(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <Mountain size={12} className="text-polar-400" />
          <span>Icebergs</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showSeaIce} onChange={(e) => setShowSeaIce(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <span className="text-polar-400">Sea-Ice</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showRiskZones} onChange={(e) => setShowRiskZones(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <span className="text-polar-400">Risk Zones</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showHist} onChange={(e) => setShowHist(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <span className="text-polar-400">Historical Traj.</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showPred} onChange={(e) => setShowPred(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <span className="text-polar-400">Predicted Traj.</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} className="rounded bg-polar-800 border-polar-600 text-ice-moderate" />
          <Target size={12} className="text-polar-400" />
          <span>Recommended Route</span>
        </label>
      </div>

      {/* Map */}
      <div ref={mapRef} className="flex-1 rounded-xl border border-polar-700 bg-polar-900 overflow-hidden relative min-h-[50vh]" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-polar-950/60">
          <div className="text-polar-400 text-sm">Loading Antarctic map…</div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-polar-400 bg-polar-900 rounded-lg px-3 py-2 border border-polar-700">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: '#38bdf8' }} />Recommended route</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#f59e0b' }} className="w-3 h-3 rounded" />Alternative route</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#94a3b8' }} className="w-2 h-2 rounded-full" />Small iceberg</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#475569' }} className="w-2 h-2 rounded-full" />Large iceberg</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#22c55e' }} className="w-2 h-2 rounded" />Low ice</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#f59e0b' }} className="w-2 h-2 rounded" />Moderate ice</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#f97316' }} className="w-2 h-2 rounded" />High ice</div>
        <div className="flex items-center gap-1.5"><span style={{ background: '#ef4444' }} className="w-2 h-2 rounded" />Very high ice</div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-polar-600">Historical: grey dashed</span>
          <span className="text-polar-600 ml-2">Predicted: red dashed</span>
        </div>
      </div>

      {/* Selected iceberg detail */}
      {selectedIceberg && (
        <div className="rounded-xl border border-polar-700 bg-polar-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-polar-200">Iceberg Detail — {selectedIceberg.id}</h3>
            <button onClick={() => setSelectedIceberg(null)} className="text-xs text-polar-500 hover:text-polar-300">Close</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><span className="text-polar-500">Size</span><div className="text-polar-200 font-medium">{selectedIceberg.size}</div></div>
            <div><span className="text-polar-500">Speed</span><div className="text-polar-200 font-medium">{selectedIceberg.speed_ms} m/s</div></div>
            <div><span className="text-polar-500">Direction</span><div className="text-polar-200 font-medium">{selectedIceberg.direction_deg}°</div></div>
            <div><span className="text-polar-500">Height</span><div className="text-polar-200 font-medium">{selectedIceberg.height_m ?? '—'} m</div></div>
          </div>
          <div className="mt-3 flex items-center gap-1 text-[10px] text-polar-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Synthetic/demo data
          </div>
        </div>
      )}
    </div>
  );
}
