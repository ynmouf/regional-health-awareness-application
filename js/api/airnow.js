import { cacheGet, cacheSet } from '../utils/cache.js';

// Get a free key at https://docs.airnowapi.org/
// Option 1: Set window.AIRNOW_KEY before loading (for local dev)
// Option 2: Leave empty and fall back to Open-Meteo only (recommended for public deployments)
export const AIRNOW_KEY = window.AIRNOW_KEY || '';

const BASE = 'https://www.airnowapi.org/aq';

/* Returns { aqi, category, pm25, ozone, timestamp } or null if unavailable */
export async function fetchAirNow(lat, lon) {
  if (!AIRNOW_KEY) return null;

  const cacheKey = `airnow_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const date = new Date().toISOString().split('T')[0];
    const url = `${BASE}/observation/latLong/current/?latitude=${lat}&longitude=${lon}&date=${date}&distance=25&format=application/json&API_KEY=${AIRNOW_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;

    // Pick the highest AQI reading
    const sorted = data.sort((a, b) => b.AQI - a.AQI);
    const top = sorted[0];
    const pm25 = data.find(d => d.ParameterName === 'PM2.5');
    const ozone = data.find(d => d.ParameterName === 'OZONE');

    const result = {
      aqi: top.AQI,
      category: top.Category.Name,
      pm25: pm25?.AQI ?? null,
      pm25Raw: pm25?.AQI ?? null,
      ozone: ozone?.AQI ?? null,
      timestamp: new Date().toISOString(),
      source: 'AirNow (EPA)',
      confidence: 'high',
    };
    cacheSet(cacheKey, result, 2 * 60 * 60 * 1000); // 2h
    return result;
  } catch { return null; }
}
