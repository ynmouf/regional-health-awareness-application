import { cacheGet, cacheSet } from '../utils/cache.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

function validateCoords(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    throw new Error('Invalid coordinates');
  }
  return { lat: la, lon: lo };
}

/* Returns { hospitals, pharmacies, hasSpecialist, details } */
export async function fetchHealthcare(lat, lon) {
  const coords = validateCoords(lat, lon);
  lat = coords.lat; lon = coords.lon;

  const key = `overpass_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const query = buildQuery(lat, lon);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error('Overpass unavailable');
    const data = await res.json();
    const elements = data.elements ?? [];

    const hospitals = elements.filter(e =>
      e.tags?.amenity === 'hospital' ||
      (e.tags?.amenity === 'clinic' && e.tags?.healthcare === 'hospital')
    );
    const pharmacies = elements.filter(e => e.tags?.amenity === 'pharmacy');
    const hasSpecialist = elements.some(e =>
      e.tags?.['healthcare:speciality'] === 'immunology' ||
      e.tags?.['healthcare:speciality'] === 'allergy' ||
      e.tags?.['healthcare:speciality'] === 'allergy_and_immunology' ||
      e.tags?.['medical_system:speciality'] === 'immunology' ||
      (e.tags?.name && /immunol|allerg/i.test(e.tags.name))
    );

    const result = {
      hospitalCount: hospitals.length,
      pharmacyCount: pharmacies.length,
      hasSpecialist,
      hospitals: hospitals.slice(0, 10).map(e => ({
        name: e.tags?.name ?? 'Hospital',
        lat: e.lat ?? e.center?.lat ?? null,
        lon: e.lon ?? e.center?.lon ?? null,
      })),
      pharmacies: pharmacies.slice(0, 3).map(e => e.tags?.name ?? 'Pharmacy'),
      source: 'OpenStreetMap (Overpass API)',
      confidence: 'medium',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 24 * 60 * 60 * 1000); // 24h
    return result;
  } catch {
    return {
      hospitalCount: null, pharmacyCount: null, hasSpecialist: false,
      hospitals: [], pharmacies: [],
      source: 'OpenStreetMap (Overpass API)',
      confidence: 'low',
      timestamp: new Date().toISOString(),
    };
  }
}

function buildQuery(lat, lon) {
  return `
[out:json][timeout:25];
(
  node["amenity"="hospital"](around:10000,${lat},${lon});
  way["amenity"="hospital"](around:10000,${lat},${lon});
  node["amenity"="clinic"]["healthcare"="hospital"](around:10000,${lat},${lon});
  node["amenity"="pharmacy"](around:5000,${lat},${lon});
  way["amenity"="pharmacy"](around:5000,${lat},${lon});
  node["healthcare:speciality"~"immunology|allergy"](around:20000,${lat},${lon});
  way["healthcare:speciality"~"immunology|allergy"](around:20000,${lat},${lon});
  node["name"~"[Ii]mmunol|[Aa]llerg"](around:20000,${lat},${lon});
);
out body center;
`;
}
