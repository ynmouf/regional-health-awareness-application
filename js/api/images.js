import { cacheGet, cacheSet } from '../utils/cache.js';

const ALLOWED_IMAGE_HOSTS = ['upload.wikimedia.org', 'commons.wikimedia.org'];

function isAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.some(h => parsed.hostname === h);
  } catch { return false; }
}

export async function fetchCityPhotos(cityName) {
  const cacheKey = `photos_${cityName.toLowerCase().replace(/\s+/g,'_')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    // Try Wikimedia Commons API (free, no auth required)
    const query = cityName.split(',')[0]; // Use city name only
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();

    if (!data.query?.search?.length) return null;

    // Fetch file info to get image URLs
    const files = data.query.search.map(item => item.title);
    const fileUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${files.join('|')}&prop=imageinfo&iiprop=url`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error();
    const fileData = await fileRes.json();

    const result = [];
    for (const page of Object.values(fileData.query.pages)) {
      const url = page.imageinfo?.[0]?.url;
      const thumb = page.imageinfo?.[0]?.thumburl || url;
      // Only accept HTTPS URLs from trusted Wikimedia domains
      if (url && isAllowedImageUrl(url) && isAllowedImageUrl(thumb)) {
        result.push({
          url,
          thumb,
          alt: page.title || `${cityName} image`,
          credit: 'Wikimedia Commons',
          creditUrl: 'https://commons.wikimedia.org',
        });
      }
      if (result.length >= 3) break;
    }

    if (result.length === 0) return null;

    cacheSet(cacheKey, result, 7 * 24 * 60 * 60 * 1000);
    return result;
  } catch { return null; }
}
