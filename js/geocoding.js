import { sessionGet, sessionSet } from './utils/cache.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const ZIPPOPOTAM = 'https://api.zippopotam.us/us';

const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI',
  Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};

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
  const a = place.address ?? {};
  const result = {
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
    displayName: formatDisplayName(place),
    countryCode: a.country_code?.toUpperCase() ?? '',
    state: a.state ?? '',
    stateCode: stateCode(a),
    county: a.county ?? a.city ?? '',
    city: a.city || a.town || a.village || a.municipality || '',
    zipCode: a.postcode ?? '',
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
    county: '',
    city: place['place name'],
    zipCode: zip,
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
      stateCode: stateCode(p.address),
      county: p.address?.county ?? p.address?.city ?? '',
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

function stateCode(address = {}) {
  return address.state_code ||
    address['ISO3166-2-lvl4']?.split('-')[1] ||
    STATE_ABBR[address.state] ||
    '';
}
