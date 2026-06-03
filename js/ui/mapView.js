/* Interactive map using Leaflet + free Esri satellite tiles */

let mapInstance = null;

const ESRI_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export function initMap(containerId, lat, lon, hospitals = []) {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  const map = L.map(containerId, {
    center: [lat, lon],
    zoom: 13,
    zoomControl: true,
    scrollWheelZoom: false, // avoid scroll hijacking on page
  });

  // Esri satellite imagery (free, no key)
  L.tileLayer(ESRI_SAT, {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }).addTo(map);

  // Label overlay
  L.tileLayer(ESRI_LABELS, {
    attribution: '',
    maxZoom: 19,
    opacity: 0.8,
  }).addTo(map);

  // Centre marker
  const centreIcon = L.divIcon({
    className: '',
    html: `<div class="map-pin-centre"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  L.marker([lat, lon], { icon: centreIcon, title: 'Searched location' }).addTo(map);

  // Hospital markers (if coordinates available)
  hospitals.forEach(h => {
    if (h.lat == null || h.lon == null) return;
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-pin-hospital" title="${escHtml(h.name)}">🏥</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.marker([h.lat, h.lon], { icon })
      .bindPopup(`<b>${escHtml(h.name)}</b>`)
      .addTo(map);
  });

  mapInstance = map;
  return map;
}

export function invalidateMapSize() {
  mapInstance?.invalidateSize();
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
