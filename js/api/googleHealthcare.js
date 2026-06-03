import { cacheGet, cacheSet } from '../utils/cache.js';

const BASE = 'https://places.googleapis.com/v1';

export async function fetchGoogleHealthcare(lat, lon, apiKey) {
  if (!apiKey) return null;

  const key = `g_healthcare_v2_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const [hospitals, pharmacies, specialists] = await Promise.all([
      nearbySearch(lat, lon, apiKey, 'hospital', 50000),
      nearbySearch(lat, lon, apiKey, 'pharmacy', 5000),
      specialistSearch(lat, lon, apiKey),
    ]);

    if (!hospitals?.length && !pharmacies?.length) return null;
    const hospitalsByDistance = hospitals
      .map(place => ({ ...place, distanceKm: distanceMeters(lat, lon, place.location) / 1000 }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const nearestHospital = hospitalsByDistance[0] ?? null;

    const result = {
      hospitalCount: hospitals.length,
      pharmacyCount: pharmacies.length,
      hasSpecialist: specialists.length > 0,
      nearestHospitalKm: nearestHospital?.distanceKm ?? null,
      nearestHospitalName: nearestHospital?.displayName?.text ?? null,
      urgentCareCount: 0,
      hospitals: hospitalsByDistance.slice(0, 10).map(placeSummary),
      pharmacies: pharmacies.slice(0, 3).map(p => p.displayName?.text ?? 'Pharmacy'),
      specialists: specialists.slice(0, 5).map(placeSummary),
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
  if (!res.ok) return [];
  const data = await res.json();
  return data.places ?? [];
}

async function specialistSearch(lat, lon, apiKey) {
  const res = await fetch(`${BASE}/places:searchText?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: 'allergy immunology clinic specialist',
      maxResultCount: 10,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lon },
          radius: 20000,
        },
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.places ?? []).filter(place => {
    const name = place.displayName?.text ?? '';
    return /allerg|immunol/i.test(name) && distanceMeters(lat, lon, place.location) <= 20000;
  });
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
