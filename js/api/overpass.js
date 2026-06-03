import { cacheGet, cacheSet } from '../utils/cache.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const PHARMACY_RADIUS_M = 15000;
const SPECIALIST_RADIUS_M = 50000;
const OVERPASS_TIMEOUT_MS = 12000;

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

  const key = `overpass_v4_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const query = buildQuery(lat, lon);
  try {
    const data = await fetchOverpass(query);
    const elements = data.elements ?? [];

    const hospitals = elements.filter(isHospital).map(e => withDistance(e, lat, lon))
      .filter(e => e.distanceKm != null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const pharmacies = elements.filter(isPharmacy).map(e => withDistance(e, lat, lon))
      .filter(e => e.distanceKm != null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const urgentCare = elements.filter(isUrgentCare);
    const specialists = elements.filter(isAllergyImmunologySpecialist).map(e => withDistance(e, lat, lon))
      .filter(e => e.distanceKm != null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const hasSpecialist = specialists.length > 0;
    const nearestHospital = hospitals[0] ?? null;
    const nearestPharmacy = pharmacies[0] ?? null;
    const nearestSpecialist = specialists[0] ?? null;

    const result = {
      hospitalCount: hospitals.length,
      pharmacyCount: pharmacies.length,
      specialistCount: specialists.length,
      hasSpecialist,
      nearestHospitalKm: nearestHospital?.distanceKm ?? null,
      estimatedHospitalDriveMinutes: nearestHospital?.distanceKm != null ? estimateDriveMinutes(nearestHospital.distanceKm) : null,
      nearestHospitalName: nearestHospital?.tags?.name ?? null,
      nearestPharmacyKm: nearestPharmacy?.distanceKm ?? null,
      nearestSpecialistKm: nearestSpecialist?.distanceKm ?? null,
      pharmacySearchRadiusKm: PHARMACY_RADIUS_M / 1000,
      specialistSearchRadiusKm: SPECIALIST_RADIUS_M / 1000,
      urgentCareCount: urgentCare.length,
      hospitals: hospitals.slice(0, 10).map(e => ({
        name: e.tags?.name ?? 'Hospital',
        lat: e.lat ?? e.center?.lat ?? null,
        lon: e.lon ?? e.center?.lon ?? null,
        distanceKm: e.distanceKm ?? null,
      })),
      pharmacies: pharmacies.slice(0, 5).map(e => e.tags?.name ?? 'Pharmacy'),
      specialists: specialists.slice(0, 5).map(e => ({
        name: e.tags?.name ?? 'Allergy / immunology specialist',
        lat: e.lat ?? e.center?.lat ?? null,
        lon: e.lon ?? e.center?.lon ?? null,
        distanceKm: e.distanceKm ?? null,
      })),
      source: 'OpenStreetMap (Overpass API)',
      confidence: nearestHospital || pharmacies.length ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 24 * 60 * 60 * 1000); // 24h
    return result;
  } catch {
    return {
      hospitalCount: null, pharmacyCount: null, hasSpecialist: null,
      specialistCount: null, nearestHospitalKm: null, estimatedHospitalDriveMinutes: null, nearestHospitalName: null,
      nearestPharmacyKm: null, nearestSpecialistKm: null, urgentCareCount: null,
      pharmacySearchRadiusKm: PHARMACY_RADIUS_M / 1000,
      specialistSearchRadiusKm: SPECIALIST_RADIUS_M / 1000,
      hospitals: [], pharmacies: [], specialists: [],
      source: 'OpenStreetMap (Overpass API)',
      confidence: 'low',
      timestamp: new Date().toISOString(),
    };
  }
}

async function fetchOverpass(query) {
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Overpass unavailable: ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error('Overpass unavailable');
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
  node["amenity"="pharmacy"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  way["amenity"="pharmacy"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  relation["amenity"="pharmacy"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  node["healthcare"="pharmacy"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  way["healthcare"="pharmacy"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  node["shop"~"chemist|medicine"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  way["shop"~"chemist|medicine"](around:${PHARMACY_RADIUS_M},${lat},${lon});
  node["healthcare:speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  way["healthcare:speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  relation["healthcare:speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  node["healthcare:specialty"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  way["healthcare:specialty"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  node["medical_system:speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  way["medical_system:speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  node["speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  way["speciality"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  node["name"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
  way["name"~"[Ii]mmunol|[Aa]llerg|[Aa]sthma"](around:${SPECIALIST_RADIUS_M},${lat},${lon});
);
out body center;
`;
}

function isHospital(e) {
  return e.tags?.amenity === 'hospital' || e.tags?.healthcare === 'hospital';
}

function isPharmacy(e) {
  return e.tags?.amenity === 'pharmacy' ||
    e.tags?.healthcare === 'pharmacy' ||
    ['chemist', 'medicine'].includes(e.tags?.shop);
}

function isUrgentCare(e) {
  return e.tags?.healthcare === 'urgent_care' ||
    e.tags?.emergency === 'yes' ||
    /urgent care|emergency/i.test(e.tags?.name ?? '');
}

function isAllergyImmunologySpecialist(e) {
  const tags = e.tags ?? {};
  const values = [
    tags['healthcare:speciality'],
    tags['healthcare:specialty'],
    tags['medical_system:speciality'],
    tags.speciality,
    tags.specialty,
    tags.name,
    tags.description,
  ].filter(Boolean).join(' ');
  return /immunol|allerg|asthma/i.test(values);
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

function estimateDriveMinutes(distanceKm) {
  if (distanceKm == null) return null;
  const averageKmh = distanceKm < 10 ? 32 : distanceKm < 30 ? 48 : 64;
  return Math.round((distanceKm / averageKmh) * 60 + 6);
}
