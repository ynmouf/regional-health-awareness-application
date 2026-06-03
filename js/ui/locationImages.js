const getMapsKey = () => window.GOOGLE_MAPS_KEY || '';

export function renderLocationImages(placePhotos, lat, lon, locationName) {
  const container = document.getElementById('location-images');
  container.innerHTML = '';

  const key = getMapsKey();
  const hasPhotos = placePhotos && placePhotos.length;
  const hasKey = !!key;
  const hasSatellite = hasKey && lat != null && lon != null;

  if (!hasPhotos && !hasSatellite) {
    container.hidden = true;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `location-media${hasPhotos && hasSatellite ? ' has-both' : ''}`;

  // Satellite panel (left)
  if (hasSatellite) {
    const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=13&size=800x600&maptype=satellite&key=${escAttr(key)}`;
    const satPanel = document.createElement('div');
    satPanel.className = 'media-satellite';
    satPanel.innerHTML = `
      <div class="collage-img-wrap">
        <img src="${satelliteUrl}" alt="Satellite view of ${escAttr(locationName)}" loading="lazy" />
        <span class="collage-credit">Satellite · Google Maps</span>
      </div>
    `;
    wrapper.appendChild(satPanel);
  }

  // Photos collage (right)
  if (hasPhotos) {
    const photosPanel = document.createElement('div');
    photosPanel.className = 'media-photos';
    renderCollageInto(photosPanel, placePhotos);
    wrapper.appendChild(photosPanel);
  }

  container.appendChild(wrapper);
  container.hidden = false;
}

function renderCollageInto(panel, photos) {
  // First photo as hero
  const hero = document.createElement('div');
  hero.className = 'collage-hero';
  hero.innerHTML = buildPhotoCard(photos[0]);
  panel.appendChild(hero);

  // Remaining photos in a grid (up to 5 more)
  if (photos.length > 1) {
    const grid = document.createElement('div');
    grid.className = 'collage-grid';
    photos.slice(1, 6).forEach(photo => {
      const cell = document.createElement('div');
      cell.className = 'collage-cell';
      cell.innerHTML = buildPhotoCard(photo);
      grid.appendChild(cell);
    });
    panel.appendChild(grid);
  }
}

function buildPhotoCard(photo) {
  return `
    <div class="collage-img-wrap">
      <img src="${escAttr(photo.url)}" alt="${escAttr(photo.alt || '')}" loading="lazy" />
      <a href="${escAttr(photo.creditUrl)}" target="_blank" rel="noopener" class="collage-credit">
        📷 ${escAttr(photo.credit)}
      </a>
    </div>
  `;
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
