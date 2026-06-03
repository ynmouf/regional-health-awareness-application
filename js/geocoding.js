import { sessionGet, sessionSet } from './utils/cache.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const ZIPPOPOTAM = 'https://api.zippopotam.us/us';

/* Returns { lat, lon, displayName, countryCode, state } or throws */
export async function geocode(query) {
  const q = query.trim();
  const cacheKey = `geo_${q.toLowerCase()}`;
  const cached = sessionGet(cacheKey);
  if (cached) return cached;

  // US ZIP code shortcut
  if (/^\d{5}$/.test(q)) {
    const result = await geocodeZip(q);
    sessionSet(cacheKey, result);
    return result;
  }

  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'HealthLocationScorer/1.0' } });
  if (!res.ok) throw new Error('Geocoding service unavailable');
  const data = await res.json();
  if (!data.length) throw new Error(`Location not found: "${q}"`);

  const place = data[0];
  const result = {
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    displayName: formatDisplayName(place),
    countryCode: place.address?.country_code?.toUpperCase() ?? '',
    state: place.address?.state ?? '',
    stateCode: place.address?.['ISO3166-2-lvl4']?.split('-')[1] ?? '',
  };
  sessionSet(cacheKey, result);
  return result;
}

async function geocodeZip(zip) {
  const res = await fetch(`${ZIPPOPOTAM}/${zip}`);
  if (!res.ok) throw new Error(`ZIP code not found: ${zip}`);
  const data = await res.json();
  const place = data.places[0];
  return {
    lat: parseFloat(place.latitude),
    lon: parseFloat(place.longitude),
    displayName: `${place['place name']}, ${place['state abbreviation']} ${zip}`,
    countryCode: 'US',
    state: place.state,
    stateCode: place['state abbreviation'],
  };
}

/* Autocomplete — returns array of { label, lat, lon, countryCode, state, stateCode } */
export async function suggest(query) {
  if (query.trim().length < 2) return [];
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&featuretype=city`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'HealthLocationScorer/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(p => ({
      label: formatDisplayName(p),
      lat: parseFloat(p.lat),
      lon: parseFloat(p.lon),
      countryCode: p.address?.country_code?.toUpperCase() ?? '',
      state: p.address?.state ?? '',
      stateCode: p.address?.['ISO3166-2-lvl4']?.split('-')[1] ?? '',
    }));
  } catch { return []; }
}

function formatDisplayName(place) {
  const a = place.address ?? {};
  const city = a.city || a.town || a.village || a.municipality || place.name;
  const state = a.state_code || a.state;
  const country = a.country_code?.toUpperCase();
  if (city && state && country === 'US') return `${city}, ${state}`;
  if (city && state) return `${city}, ${state}, ${a.country}`;
  return place.display_name.split(',').slice(0, 3).join(',').trim();
}
