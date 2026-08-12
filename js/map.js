// ============================================================
// js/map.js  —  Live Map Rendering
// ============================================================
// Renders truck and farmer pins on a canvas-style grid map.
// Coordinates come from your Google Sheet Lat/Lon columns.
//
// MAP BOUNDS — set to cover your operating region.
// Your sheet spans Senegal → Ghana → Côte d'Ivoire → Guinea:
//   Lat: ~4°N to ~16°N   Lon: ~-18°W to ~0°W
// If you expand into new regions, update MAP_BOUNDS below.
//
// FIXED IN THIS AUDIT: tooltip content is built via innerHTML from
// farmer/driver names and villages — the same stored-XSS surface as
// tables.js — so it's now passed through escapeHtml() (defined in
// tables.js, safe to reference here because by the time renderMap()
// is actually called at runtime, every script tag has finished
// loading and defining its globals).
// ============================================================

const MAP_BOUNDS = {
  latMin: 4.0,
  latMax: 16.5,
  lonMin: -18.5,
  lonMax:  1.0,
};

// Convert GPS coordinates to pixel position within the map div
function gpsToPixel(lat, lon, mapW, mapH) {
  const x = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * mapW;
  const y = (1 - (lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * mapH;
  return { x, y };
}

// Haversine formula — distance in km between two GPS points.
// Used to find the nearest available truck to a farmer.
// This is pure math — no API, no AI needed.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

let _mapData = { farmers: [], trucks: [] };

function renderMap(farmers, trucks) {
  _mapData = { farmers, trucks };

  const canvas = document.getElementById("mapCanvas");
  if (!canvas) return;

  // Clear previous pins
  canvas.querySelectorAll(".truck-pin, .farmer-pin").forEach(el => el.remove());

  const W = canvas.offsetWidth  || canvas.clientWidth;
  const H = canvas.offsetHeight || canvas.clientHeight;
  const tooltip = document.getElementById("mapTooltip");

  function attachTooltip(el, lines) {
    el.addEventListener("mouseenter", e => {
      tooltip.innerHTML = lines.map((l, i) =>
        i === 0 ? `<div class="tt-label">${escapeHtml(l)}</div>` : `<div>${escapeHtml(l)}</div>`
      ).join("");
      tooltip.style.display = "block";
      // Position tooltip relative to canvas
      const rect = canvas.getBoundingClientRect();
      const ex = e.clientX - rect.left;
      const ey = e.clientY - rect.top;
      tooltip.style.left = (ex + 14) + "px";
      tooltip.style.top  = (ey - 10) + "px";
    });
    el.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left + 14) + "px";
      tooltip.style.top  = (e.clientY - rect.top  - 10) + "px";
    });
    el.addEventListener("mouseleave", () => tooltip.style.display = "none");
  }

  // ── Farmer pins (diamond shapes via CSS rotate) ──────────
  farmers.forEach(f => {
    const lat = parseFloat(f.Lat), lon = parseFloat(f.Lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const { x, y } = gpsToPixel(lat, lon, W, H);
    const pin = document.createElement("div");
    pin.className = "farmer-pin";
    pin.style.left = x + "px";
    pin.style.top  = y + "px";
    attachTooltip(pin, [
      "Farmer",
      f.Name,
      f.Village,
      `GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`
    ]);
    canvas.appendChild(pin);
  });

  // ── Truck pins ────────────────────────────────────────────
  trucks.forEach(t => {
    const lat = parseFloat(t.Lat), lon = parseFloat(t.Lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const { x, y } = gpsToPixel(lat, lon, W, H);
    const pin = document.createElement("div");
    pin.className = `truck-pin ${statusClass(t.Status)}`;
    pin.style.left = x + "px";
    pin.style.top  = y + "px";
    attachTooltip(pin, [
      t.TruckID,
      t.DriverName,
      t.Status,
      `GPS ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      `Updated: ${t.LastUpdated}`
    ]);
    canvas.appendChild(pin);
  });
}

// Re-render map when window resizes (pins use absolute px positions)
window.addEventListener("resize", () => {
  if (document.getElementById("page-map")?.classList.contains("active")) {
    renderMap(_mapData.farmers, _mapData.trucks);
  }
});
