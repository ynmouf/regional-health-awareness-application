let photos = [];
let current = 0;

const lb       = () => document.getElementById('lightbox');
const img      = () => lb().querySelector('.lightbox-img');
const credit   = () => lb().querySelector('.lightbox-credit');
const link     = () => lb().querySelector('.lightbox-link');
const dots     = () => lb().querySelector('.lightbox-dots');
const prev     = () => lb().querySelector('.lightbox-prev');
const next     = () => lb().querySelector('.lightbox-next');

export function initLightbox() {
  lb().querySelector('.lightbox-backdrop').addEventListener('click', close);
  lb().querySelector('.lightbox-close').addEventListener('click', close);
  prev().addEventListener('click', () => navigate(-1));
  next().addEventListener('click', () => navigate(1));
  document.addEventListener('keydown', onKey);
}

export function openLightbox(allPhotos, index) {
  photos = allPhotos;
  current = index;
  render();
  lb().hidden = false;
  document.body.style.overflow = 'hidden';
  lb().querySelector('.lightbox-close').focus();
}

function close() {
  lb().hidden = true;
  document.body.style.overflow = '';
}

function navigate(dir) {
  current = (current + dir + photos.length) % photos.length;
  render();
}

function onKey(e) {
  if (lb().hidden) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowLeft') navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
}

function render() {
  const p = photos[current];
  const i = img();
  i.src = p.url;
  i.alt = p.alt || '';
  credit().textContent = p.credit ? `📷 ${p.credit}` : '';
  link().href = p.creditUrl || '#';

  // Prev/next visibility
  prev().style.display = photos.length > 1 ? '' : 'none';
  next().style.display = photos.length > 1 ? '' : 'none';

  // Dots
  const d = dots();
  d.innerHTML = '';
  if (photos.length > 1) {
    photos.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = `lb-dot${i === current ? ' active' : ''}`;
      dot.setAttribute('aria-label', `Photo ${i + 1}`);
      dot.addEventListener('click', () => { current = i; render(); });
      d.appendChild(dot);
    });
  }
}
