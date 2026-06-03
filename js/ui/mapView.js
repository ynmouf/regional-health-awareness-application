let leafletMap = null;

const ESRI_SAT    = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export function initMap(containerId, lat, lon, hospitals = []) {
  const key = window.GOOGLE_MAPS_KEY || '';

  if (key) {
    initGoogleEmbed(containerId, lat, lon, key);
  } else {
    initLeafletFallback(containerId, lat, lon, hospitals);
  }
}

/* Google Maps Embed — fully interactive, satellite + street view toggle */
function initGoogleEmbed(containerId, lat, lon, key) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const src = `https://www.google.com/maps/embed/v1/view` +
    `?key=${encodeURIComponent(key)}` +
    `&center=${lat},${lon}` +
    `&zoom=14` +
    `&maptype=satellite`;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.width = '100%';
  iframe.height = '100%';
  iframe.style.cssText = 'border:0; display:block; border-radius:inherit;';
  iframe.loading = 'lazy';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.title = 'Interactive map of location';
  container.appendChild(iframe);
}

/* Leaflet fallback — free, no key, Esri satellite tiles */
function initLeafletFallback(containerId, lat, lon, hospitals) {
  if (typeof L === 'undefined') return;
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }

  const map = L.map(containerId, {
    center: [lat, lon], zoom: 13, scrollWheelZoom: false,
  });
  L.tileLayer(ESRI_SAT, { attribution: 'Tiles &copy; Esri', maxZoom: 19 }).addTo(map);
  L.tileLayer(ESRI_LABELS, { attribution: '', maxZoom: 19, opacity: 0.8 }).addTo(map);

  const pin = L.divIcon({ className: '', html: '<div class="map-pin-centre"></div>', iconSize: [14,14], iconAnchor: [7,7] });
  L.marker([lat, lon], { icon: pin }).addTo(map);

  hospitals.forEach(h => {
    if (h.lat == null) return;
    const icon = L.divIcon({ className: '', html: '🏥', iconSize: [20,20], iconAnchor: [10,10] });
    L.marker([h.lat, h.lon], { icon }).bindPopup(escHtml(h.name)).addTo(map);
  });

  leafletMap = map;
}

export function invalidateMapSize() {
  leafletMap?.invalidateSize();
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
