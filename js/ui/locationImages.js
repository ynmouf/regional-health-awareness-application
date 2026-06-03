import { initMap } from './mapView.js';
import { openLightbox } from './lightbox.js';

export function renderLocationImages(placePhotos, lat, lon, locationName, hospitals) {
  const container = document.getElementById('location-images');
  container.innerHTML = '';

  const hasPhotos = placePhotos && placePhotos.length;
  const hasCoords = lat != null && lon != null;

  if (!hasPhotos && !hasCoords) {
    container.hidden = true;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `location-media${hasPhotos && hasCoords ? ' has-both' : ''}`;

  // Interactive map (left panel)
  if (hasCoords) {
    const mapPanel = document.createElement('div');
    mapPanel.className = 'media-map';
    const mapEl = document.createElement('div');
    mapEl.id = 'location-map';
    mapEl.className = 'leaflet-container-wrap';
    mapPanel.appendChild(mapEl);
    wrapper.appendChild(mapPanel);

    // Defer Leaflet init until the element is in the DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        initMap('location-map', lat, lon, hospitals ?? []);
      });
    });
  }

  // Photo collage (right panel)
  if (hasPhotos) {
    const photosPanel = document.createElement('div');
    photosPanel.className = 'media-photos';
    renderCollage(photosPanel, placePhotos);
    wrapper.appendChild(photosPanel);
  }

  container.appendChild(wrapper);
  container.hidden = false;
}

function renderCollage(panel, photos) {
  const grid = document.createElement('div');
  grid.className = 'collage-varied';

  const areas = ['a','b','c','d','e','f'];
  const sliced = photos.slice(0, 6);
  sliced.forEach((photo, i) => {
    const cell = document.createElement('div');
    cell.className = `collage-area-${areas[i]}`;
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `View photo: ${photo.alt || 'location photo'}`);
    cell.innerHTML = `
      <div class="collage-img-wrap">
        <img src="${escAttr(photo.url)}" alt="${escAttr(photo.alt || '')}" loading="lazy" />
        <span class="collage-credit">📷 ${escAttr(photo.credit)}</span>
      </div>
    `;
    // Click → lightbox (not photographer profile)
    cell.addEventListener('click', () => openLightbox(sliced, i));
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(sliced, i); } });
    grid.appendChild(cell);
  });

  panel.appendChild(grid);
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
