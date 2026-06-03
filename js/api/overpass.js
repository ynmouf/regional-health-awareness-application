import { cacheGet, cacheSet } from '../utils/cache.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

function validateCoords(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    throw new Error('Invalid coordinates');
  }
  return { lat: la, lon: lo };
}

/* Returns nearby healthcare access, including adjacent-area hospitals by distance */
export async function fetchHealthcare(lat, lon) {
  const coords = validateCoords(lat, lon);
  lat = coords.lat; lon = coords.lon;

  const key = `overpass_v2_${lat.toFixed(2)}_${lon.toFixed(2)}`;
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

    const hospitals = elements.filter(isHospital).map(e => withDistance(e, lat, lon))
      .filter(e => e.distanceKm != null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const pharmacies = elements.filter(e => e.tags?.amenity === 'pharmacy');
    const urgentCare = elements.filter(isUrgentCare);
    const hasSpecialist = elements.some(e =>
      e.tags?.['healthcare:speciality'] === 'immunology' ||
      e.tags?.['healthcare:speciality'] === 'allergy' ||
      e.tags?.['healthcare:speciality'] === 'allergy_and_immunology' ||
      e.tags?.['medical_system:speciality'] === 'immunology' ||
      (e.tags?.name && /immunol|allerg/i.test(e.tags.name))
    );
    const nearestHospital = hospitals[0] ?? null;

    const result = {
      hospitalCount: hospitals.length,
      pharmacyCount: pharmacies.length,
      hasSpecialist,
      nearestHospitalKm: nearestHospital?.distanceKm ?? null,
      nearestHospitalName: nearestHospital?.tags?.name ?? null,
      urgentCareCount: urgentCare.length,
      hospitals: hospitals.slice(0, 10).map(e => ({
        name: e.tags?.name ?? 'Hospital',
        lat: e.lat ?? e.center?.lat ?? null,
        lon: e.lon ?? e.center?.lon ?? null,
        distanceKm: e.distanceKm ?? null,
      })),
      pharmacies: pharmacies.slice(0, 3).map(e => e.tags?.name ?? 'Pharmacy'),
      source: 'OpenStreetMap (Overpass API)',
      confidence: nearestHospital || pharmacies.length ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 24 * 60 * 60 * 1000); // 24h
    return result;
  } catch {
    return {
      hospitalCount: null, pharmacyCount: null, hasSpecialist: false,
      nearestHospitalKm: null, nearestHospitalName: null, urgentCareCount: null,
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
  node["amenity"="hospital"](around:50000,${lat},${lon});
  way["amenity"="hospital"](around:50000,${lat},${lon});
  relation["amenity"="hospital"](around:50000,${lat},${lon});
  node["healthcare"="hospital"](around:50000,${lat},${lon});
  way["healthcare"="hospital"](around:50000,${lat},${lon});
  relation["healthcare"="hospital"](around:50000,${lat},${lon});
  node["amenity"="clinic"]["emergency"="yes"](around:20000,${lat},${lon});
  way["amenity"="clinic"]["emergency"="yes"](around:20000,${lat},${lon});
  node["healthcare"="urgent_care"](around:20000,${lat},${lon});
  way["healthcare"="urgent_care"](around:20000,${lat},${lon});
  node["amenity"="pharmacy"](around:5000,${lat},${lon});
  way["amenity"="pharmacy"](around:5000,${lat},${lon});
  node["healthcare:speciality"~"immunology|allergy"](around:20000,${lat},${lon});
  way["healthcare:speciality"~"immunology|allergy"](around:20000,${lat},${lon});
  node["name"~"[Ii]mmunol|[Aa]llerg"](around:20000,${lat},${lon});
);
out body center;
`;
}

function isHospital(e) {
  return e.tags?.amenity === 'hospital' || e.tags?.healthcare === 'hospital';
}

function isUrgentCare(e) {
  return e.tags?.healthcare === 'urgent_care' ||
    e.tags?.emergency === 'yes' ||
    /urgent care|emergency/i.test(e.tags?.name ?? '');
}

function withDistance(e, lat, lon) {
  const elLat = e.lat ?? e.center?.lat ?? null;
  const elLon = e.lon ?? e.center?.lon ?? null;
  return {
    ...e,
    distanceKm: elLat != null && elLon != null ? distanceKm(lat, lon, elLat, elLon) : null,
  };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}
