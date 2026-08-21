// ============================================================
// Live Map — CLAUDE.md Phase 10.
//
// PROVIDER: Leaflet + OpenStreetMap tiles.
//   - Free, no API key at all — nothing to leak, nothing to restrict.
//   - Leaflet (leaflet/react-leaflet) is a mature, actively-maintained
//     open-source library (BSD-2-Clause), safe to depend on.
//   - Tiles are pulled from the public OSM tile server. Their usage
//     policy (operations.osmfoundation.org/policies/tiles) is fine for
//     dev/low-moderate traffic but explicitly discourages heavy
//     production load without either self-hosting tiles or switching to
//     a dedicated provider (MapTiler, Stadia Maps, etc. all have proper
//     free tiers). Revisit the TileLayer `url` below before real launch
//     traffic — that's the only line that would need to change.
//   - Attribution (the "© OpenStreetMap contributors" credit) is legally
//     required by OSM's license and is included below — don't remove it.
//
// FUTURE OPTION: Google Maps.
//   If a client specifically wants Google's tiles/geocoding/street view:
//     1. npm install @react-google-maps/api
//     2. Get an API key in Google Cloud Console, enable "Maps JavaScript
//        API", and restrict the key by HTTP referrer to this app's
//        domain(s) — Maps JS API keys are always visible in client-side
//        code by design; the restriction is what makes it "safe" to
//        expose, not secrecy (unlike TWILIO_AUTH_TOKEN, which must never
//        reach the browser at all).
//     3. Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env (and .env.example).
//     4. Swap <MapContainer>/<TileLayer> below for <GoogleMap>, and the
//        <Marker>/<Popup> components for that package's equivalents. The
//        data-fetching (mapApi.ts) and marker-color logic don't need to
//        change at all — only this rendering layer does.
//   Google Maps has per-request billing beyond a monthly free credit, so
//   per CLAUDE.md §50 don't switch to it without the developer's
//   explicit approval.
// ============================================================
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Vehicle, Farm, Farmer } from "../../types/api";
import * as api from "./mapApi";
import { ApiError } from "../../lib/apiClient";

const VEHICLE_STATUS_COLOR: Record<Vehicle["status"], string> = {
  AVAILABLE: "#4a7a1e",
  EN_ROUTE: "#8a6d1d",
  MAINTENANCE: "#a13a30",
  INACTIVE: "#777777",
};
const FARM_COLOR = "#2a5c8a";

// Small inline SVG pins instead of Leaflet's default marker images, which
// need asset-path configuration to bundle correctly with Vite — this
// sidesteps that entirely and keeps the map self-contained. The color is
// always one of the fixed values above, never user-supplied text, so
// building this HTML string is safe.
function pinIcon(color: string, shape: "circle" | "square") {
  const shapeSvg =
    shape === "circle"
      ? `<circle cx="11" cy="11" r="8" fill="${color}" stroke="white" stroke-width="2"/>`
      : `<rect x="4" y="4" width="14" height="14" rx="2" fill="${color}" stroke="white" stroke-width="2"/>`;
  return L.divIcon({
    className: "map-pin-icon",
    html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">${shapeSvg}</svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function MapPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listVehicles(), api.listFarms(), api.listFarmers()])
      .then(([v, f, fa]) => {
        setVehicles(v);
        setFarms(f);
        setFarmers(fa);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load map data"))
      .finally(() => setLoading(false));
  }, []);

  const farmerName = (id: string) => farmers.find((f) => f.id === id)?.name ?? "Unknown farmer";

  const vehiclePoints = vehicles.filter(
    (v): v is Vehicle & { currentLatitude: number; currentLongitude: number } =>
      v.currentLatitude != null && v.currentLongitude != null,
  );
  const farmPoints = farms.filter(
    (f): f is Farm & { latitude: number; longitude: number } => f.latitude != null && f.longitude != null,
  );

  const allCoords: [number, number][] = [
    ...vehiclePoints.map((v) => [v.currentLatitude, v.currentLongitude] as [number, number]),
    ...farmPoints.map((f) => [f.latitude, f.longitude] as [number, number]),
  ];
  // Fall back to a neutral world view when nothing has coordinates yet,
  // rather than guessing a region.
  const bounds: L.LatLngBoundsExpression =
    allCoords.length > 0 ? L.latLngBounds(allCoords) : L.latLngBounds([-30, -30], [30, 30]);

  return (
    <div className="map-page">
      <div className="map-page-header">
        <h1>Live Map</h1>
        <div className="map-legend">
          <span><i style={{ background: VEHICLE_STATUS_COLOR.AVAILABLE }} className="legend-dot" /> Available</span>
          <span><i style={{ background: VEHICLE_STATUS_COLOR.EN_ROUTE }} className="legend-dot" /> En route</span>
          <span><i style={{ background: VEHICLE_STATUS_COLOR.MAINTENANCE }} className="legend-dot" /> Maintenance</span>
          <span><i style={{ background: FARM_COLOR }} className="legend-square" /> Farm</span>
        </div>
      </div>

      {error && <p className="page-error">{error}</p>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && (
        <div className="map-container-wrap">
          <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40] }} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {vehiclePoints.map((v) => (
              <Marker
                key={v.id}
                position={[v.currentLatitude, v.currentLongitude]}
                icon={pinIcon(VEHICLE_STATUS_COLOR[v.status], "circle")}
              >
                <Popup>
                  <strong>{v.name}</strong> ({v.registrationNumber})
                  <br />
                  Driver: {v.primaryDriver?.name ?? "—"}
                  <br />
                  Status: {v.status}
                  <br />
                  {v.locationSource === "GPS" ? "GPS" : "SMS-reported"}
                  {v.locationUpdatedAt && <> · updated {new Date(v.locationUpdatedAt).toLocaleString()}</>}
                </Popup>
              </Marker>
            ))}
            {farmPoints.map((f) => (
              <Marker key={f.id} position={[f.latitude, f.longitude]} icon={pinIcon(FARM_COLOR, "square")}>
                <Popup>
                  <strong>{f.name}</strong>
                  <br />
                  Farmer: {farmerName(f.farmerId)}
                  <br />
                  {f.address ?? "No address on file"}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
