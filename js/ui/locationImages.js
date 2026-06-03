/* Google Static Maps key — set via window.GOOGLE_MAPS_KEY before the module loads */
const getMapsKey = () => window.GOOGLE_MAPS_KEY || '';

export function renderLocationImages(photos, lat, lon, locationName) {
  const container = document.getElementById('location-images');
  container.innerHTML = '';

  const hasPhotos = photos && photos.length;
  const hasMapsKey = !!getMapsKey();

  if (!hasPhotos && !hasMapsKey) {
    container.hidden = true;
    return;
  }

  // Google Static Maps (satellite) + Street View (ground-level photo)
  if (hasMapsKey && lat != null && lon != null) {
    const key = getMapsKey();
    const satelliteUrl  = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=13&size=600x280&maptype=satellite&key=${escAttr(key)}`;
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x280&location=${lat},${lon}&fov=90&pitch=0&key=${escAttr(key)}`;

    [
      { url: satelliteUrl,  label: 'Satellite view' },
      { url: streetViewUrl, label: 'Street view' },
    ].forEach(({ url, label }) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `
        <img src="${url}" alt="${escAttr(label)} of ${escAttr(locationName)}" loading="lazy" />
        <span class="image-credit">${escAttr(label)} · Google Maps</span>
      `;
      container.appendChild(card);
    });
  }

  // Supplemental photos from Wikimedia / other source
  if (hasPhotos) {
    photos.slice(0, hasMapsKey ? 1 : 3).forEach(photo => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `
        <img src="${escAttr(photo.thumb)}" alt="${escAttr(photo.alt)}" loading="lazy" />
        <a href="${escAttr(photo.creditUrl)}" target="_blank" rel="noopener" class="image-credit">
          Photo · ${escAttr(photo.credit)}
        </a>
      `;
      container.appendChild(card);
    });
  }

  container.hidden = false;
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
