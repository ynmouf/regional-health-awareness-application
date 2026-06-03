export function renderLocationImages(photos) {
  const container = document.getElementById('location-images');
  container.innerHTML = '';

  if (!photos || !photos.length) {
    container.hidden = true;
    return;
  }

  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.innerHTML = `
      <img src="${escAttr(photo.thumb)}" alt="${escAttr(photo.alt)}" loading="lazy" />
      <a href="${escAttr(photo.creditUrl)}" target="_blank" rel="noopener" class="image-credit">
        Photo by ${escAttr(photo.credit)}
      </a>
    `;
    container.appendChild(card);
  });

  container.hidden = false;
}

function escAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
