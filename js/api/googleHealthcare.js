import { cacheGet, cacheSet } from '../utils/cache.js';

const BASE = 'https://places.googleapis.com/v1';
const PHARMACY_RADIUS_M = 15000;
const SPECIALIST_RADIUS_M = 50000;

export async function fetchGoogleHealthcare(lat, lon, apiKey) {
  if (!apiKey) return null;

  const key = `g_healthcare_v4_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const [hospitals, pharmacies, specialists] = await Promise.all([
      nearbySearch(lat, lon, apiKey, 'hospital', 50000),
      pharmacySearch(lat, lon, apiKey),
      specialistSearch(lat, lon, apiKey),
    ]);

    if (!hospitals?.length && !pharmacies?.length && !specialists?.length) return null;
    const hospitalsByDistance = hospitals
      .map(place => ({ ...place, distanceKm: distanceMeters(lat, lon, place.location) / 1000 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const pharmaciesByDistance = pharmacies
      .map(place => ({ ...place, distanceKm: distanceMeters(lat, lon, place.location) / 1000 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const specialistsByDistance = specialists
      .map(place => ({ ...place, distanceKm: distanceMeters(lat, lon, place.location) / 1000 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const nearestHospital = hospitalsByDistance[0] ?? null;
    const nearestPharmacy = pharmaciesByDistance[0] ?? null;
    const nearestSpecialist = specialistsByDistance[0] ?? null;

    const result = {
      hospitalCount: hospitals.length,
      pharmacyCount: pharmacies.length,
      specialistCount: specialists.length,
      hasSpecialist: specialists.length > 0,
      nearestHospitalKm: nearestHospital?.distanceKm ?? null,
      estimatedHospitalDriveMinutes: nearestHospital?.distanceKm != null ? estimateDriveMinutes(nearestHospital.distanceKm) : null,
      nearestHospitalName: nearestHospital?.displayName?.text ?? null,
      nearestPharmacyKm: nearestPharmacy?.distanceKm ?? null,
      nearestSpecialistKm: nearestSpecialist?.distanceKm ?? null,
      pharmacySearchRadiusKm: PHARMACY_RADIUS_M / 1000,
      specialistSearchRadiusKm: SPECIALIST_RADIUS_M / 1000,
      urgentCareCount: 0,
      hospitals: hospitalsByDistance.slice(0, 10).map(placeSummary),
      pharmacies: pharmaciesByDistance.slice(0, 5).map(p => p.displayName?.text ?? 'Pharmacy'),
      specialists: specialistsByDistance.slice(0, 5).map(placeSummary),
      source: 'Google Places API',
      confidence: nearestHospital ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 24 * 60 * 60 * 1000);
    return result;
  } catch {
    return null;
  }
}

async function pharmacySearch(lat, lon, apiKey) {
  const nearby = await nearbySearch(lat, lon, apiKey, 'pharmacy', PHARMACY_RADIUS_M);
  if (nearby.length) return nearby;
  return textSearch(lat, lon, apiKey, 'pharmacy drugstore', PHARMACY_RADIUS_M, 20);
}

async function nearbySearch(lat, lon, apiKey, type, radiusMeters) {
  const res = await fetch(`${BASE}/places:searchNearby?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${type} search failed: ${res.status}`);
  const data = await res.json();
  return data.places ?? [];
}

async function specialistSearch(lat, lon, apiKey) {
  const primary = await textSearch(lat, lon, apiKey, 'allergist immunologist asthma clinic', SPECIALIST_RADIUS_M, 20);
  const fallback = primary.length
    ? []
    : await textSearch(lat, lon, apiKey, 'allergy immunology doctor specialist', SPECIALIST_RADIUS_M, 10);
  return dedupePlaces([...primary, ...fallback]).filter(place => {
    const name = place.displayName?.text ?? '';
    return /allerg|immunol|asthma/i.test(name) && distanceMeters(lat, lon, place.location) <= SPECIALIST_RADIUS_M;
  });
}

async function textSearch(lat, lon, apiKey, textQuery, radiusMeters, maxResultCount) {
  const res = await fetch(`${BASE}/places:searchText?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Google Places text search failed: ${res.status}`);
  const data = await res.json();
  return (data.places ?? []).filter(place => distanceMeters(lat, lon, place.location) <= radiusMeters);
}

function dedupePlaces(places) {
  const seen = new Set();
  const result = [];
  for (const place of places) {
    const key = place.id || place.displayName?.text;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

function placeSummary(place) {
  return {
    name: place.displayName?.text ?? 'Healthcare facility',
    lat: place.location?.latitude ?? null,
    lon: place.location?.longitude ?? null,
    distanceKm: place.distanceKm ?? null,
  };
}

function distanceMeters(lat, lon, location) {
  if (!location?.latitude || !location?.longitude) return Infinity;
  const r = 6371000;
  const dLat = toRad(location.latitude - lat);
  const dLon = toRad(location.longitude - lon);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(location.latitude)) *
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
