import { cacheGet, cacheSet } from '../utils/cache.js';

const BASE = 'https://places.googleapis.com/v1';

/* Returns array of photo URLs for a city, or null */
export async function fetchPlacePhotos(locationName, apiKey) {
  if (!apiKey) return null;

  const cacheKey = `places_${locationName.toLowerCase().replace(/\W+/g,'_')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    // Step 1: Text search to get place_id and photo names
    const searchRes = await fetch(`${BASE}/places:searchText?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
      },
      body: JSON.stringify({ textQuery: locationName, maxResultCount: 1 }),
    });

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const place = searchData.places?.[0];
    if (!place?.photos?.length) return null;

    // Step 2: Build photo URLs from photo resource names (up to 6)
    const photos = place.photos.slice(0, 7).map(photo => ({
      url: `${BASE}/${photo.name}/media?maxWidthPx=800&key=${encodeURIComponent(apiKey)}`,
      alt: photo.authorAttributions?.[0]?.displayName
        ? `Photo by ${photo.authorAttributions[0].displayName}`
        : `${locationName} photo`,
      credit: photo.authorAttributions?.[0]?.displayName ?? 'Google Maps contributor',
      creditUrl: photo.authorAttributions?.[0]?.uri ?? 'https://maps.google.com',
    }));

    cacheSet(cacheKey, photos, 7 * 24 * 60 * 60 * 1000); // 7 days
    return photos;
  } catch { return null; }
}
