const getMapsKey = () => window.GOOGLE_MAPS_KEY || '';

export function renderLocationImages(placePhotos, lat, lon, locationName) {
  const container = document.getElementById('location-images');
  container.innerHTML = '';

  const key = getMapsKey();
  const hasPhotos = placePhotos && placePhotos.length;
  const hasKey = !!key;

  if (!hasPhotos && !hasKey) {
    container.hidden = true;
    return;
  }

  if (hasPhotos) {
    // Full photo collage from Places API
    renderCollage(container, placePhotos, locationName);
  } else if (hasKey && lat != null && lon != null) {
    // Fallback: satellite + street view if Places API not available
    renderMapFallback(container, lat, lon, locationName, key);
  }

  container.hidden = false;
}

function renderCollage(container, photos, locationName) {
  const wrapper = document.createElement('div');
  wrapper.className = 'photo-collage';

  // Hero photo (first, large)
  const hero = document.createElement('div');
  hero.className = 'collage-hero';
  hero.innerHTML = buildPhotoCard(photos[0], locationName);
  wrapper.appendChild(hero);

  // Grid of remaining photos (up to 5)
  if (photos.length > 1) {
    const grid = document.createElement('div');
    grid.className = 'collage-grid';
    photos.slice(1, 6).forEach(photo => {
      const cell = document.createElement('div');
      cell.className = 'collage-cell';
      cell.innerHTML = buildPhotoCard(photo, locationName);
      grid.appendChild(cell);
    });
    wrapper.appendChild(grid);
  }

  container.appendChild(wrapper);
}

function renderMapFallback(container, lat, lon, locationName, key) {
  const wrapper = document.createElement('div');
  wrapper.className = 'photo-collage';

  const hero = document.createElement('div');
  hero.className = 'collage-hero';
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=13&size=800x400&maptype=satellite&key=${escAttr(key)}`;
  hero.innerHTML = `<div class="collage-img-wrap"><img src="${satelliteUrl}" alt="Satellite view of ${escAttr(locationName)}" loading="lazy" /><span class="collage-credit">Satellite view · Google Maps</span></div>`;

  const streetUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${lat},${lon}&fov=90&pitch=0&key=${escAttr(key)}`;
  const street = document.createElement('div');
  street.className = 'collage-grid';
  const cell = document.createElement('div');
  cell.className = 'collage-cell';
  cell.innerHTML = `<div class="collage-img-wrap"><img src="${streetUrl}" alt="Street view of ${escAttr(locationName)}" loading="lazy" /><span class="collage-credit">Street view · Google Maps</span></div>`;
  street.appendChild(cell);

  wrapper.appendChild(hero);
  wrapper.appendChild(street);
  container.appendChild(wrapper);
}

function buildPhotoCard(photo, locationName) {
  return `
    <div class="collage-img-wrap">
      <img src="${escAttr(photo.url)}" alt="${escAttr(photo.alt || locationName)}" loading="lazy" />
      <a href="${escAttr(photo.creditUrl)}" target="_blank" rel="noopener" class="collage-credit">
        📷 ${escAttr(photo.credit)}
      </a>
    </div>
  `;
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
