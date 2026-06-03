import { cacheGet, cacheSet } from '../utils/cache.js';

const AQ_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WX_BASE = 'https://api.open-meteo.com/v1/forecast';
const HIST_BASE = 'https://archive-api.open-meteo.com/v1/archive';

/* Air quality: AQI, PM2.5, PM10, pollen */
export async function fetchAirQuality(lat, lon) {
  const key = `om_aq_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const url = `${AQ_BASE}?latitude=${lat}&longitude=${lon}` +
      `&hourly=us_aqi,pm2_5,pm10,dust,grass_pollen,ragweed_pollen,birch_pollen` +
      `&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const d = await res.json();
    const h = d.hourly;

    // Use current hour index
    const nowIdx = new Date().getHours();
    const aqi = firstValid(h.us_aqi, nowIdx);
    const pm25 = firstValid(h.pm2_5, nowIdx);
    const pm10 = firstValid(h.pm10, nowIdx);
    const grassPollen = firstValid(h.grass_pollen, nowIdx);
    const ragweedPollen = firstValid(h.ragweed_pollen, nowIdx);
    const birchPollen = firstValid(h.birch_pollen, nowIdx);

    // Max pollen value across types → pollen level label
    const maxPollen = Math.max(grassPollen ?? 0, ragweedPollen ?? 0, birchPollen ?? 0);

    const result = {
      aqi: aqi ?? 0,
      pm25: pm25 ?? 0,
      pm10: pm10 ?? 0,
      pollenRaw: maxPollen,
      pollenLevel: pollenLabel(maxPollen),
      grassPollen, ragweedPollen, birchPollen,
      source: 'Open-Meteo',
      confidence: aqi != null ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 2 * 60 * 60 * 1000);
    return result;
  } catch { return null; }
}

/* Weather: humidity, temperature extremes */
export async function fetchWeather(lat, lon) {
  const key = `om_wx_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const url = `${WX_BASE}?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&hourly=relativehumidity_2m&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const d = await res.json();

    // Average humidity over next 24h
    const humiditySlice = d.hourly.relativehumidity_2m.slice(0, 24);
    const avgHumidity = avg(humiditySlice);

    // 7-day average daily temp range
    const tempRanges = d.daily.temperature_2m_max.map(
      (max, i) => max - d.daily.temperature_2m_min[i]
    );
    const avgTempRange = avg(tempRanges);
    const maxTemp = Math.max(...d.daily.temperature_2m_max);
    const minTemp = Math.min(...d.daily.temperature_2m_min);

    const result = {
      avgHumidity, avgTempRange, maxTemp, minTemp,
      source: 'Open-Meteo',
      confidence: 'medium',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 6 * 60 * 60 * 1000);
    return result;
  } catch { return null; }
}

/* Historical monthly data for seasonal calendar — returns array of 12 monthly scores */
export async function fetchSeasonalHistory(lat, lon) {
  const key = `om_hist_${lat.toFixed(1)}_${lon.toFixed(1)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const endYear = new Date().getFullYear() - 1;
    const startYear = endYear - 2;
    const url = `${HIST_BASE}?latitude=${lat}&longitude=${lon}` +
      `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
      `&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean` +
      `&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Seasonal history response not ok', res.status);
      throw new Error('API not ok');
    }
    const d = await res.json();

    // Debug check
    if (!d.daily || !d.daily.time) {
      console.warn('Seasonal history: missing daily data', d);
      return null;
    }

    const months = Array.from({ length: 12 }, (_, i) => ({ tempRanges: [], humidity: [] }));
    d.daily.time.forEach((dateStr, i) => {
      const month = parseInt(dateStr.split('-')[1], 10) - 1;
      const range = d.daily.temperature_2m_max[i] - d.daily.temperature_2m_min[i];
      if (!isNaN(range)) months[month].tempRanges.push(range);
      const rh = d.daily.relative_humidity_2m_mean[i];
      if (rh != null) months[month].humidity.push(rh);
    });

    const result = months.map(m => ({
      avgTempRange: avg(m.tempRanges),
      avgHumidity: avg(m.humidity),
    }));

    cacheSet(key, result, 24 * 60 * 60 * 1000);
    return result;
  } catch (err) {
    console.error('Seasonal history error:', err.message);
    return null;
  }
}

function firstValid(arr, startIdx) {
  for (let i = startIdx; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return arr.find(v => v != null) ?? null;
}

function avg(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
}

function pollenLabel(val) {
  if (val == null || val === 0) return 'None';
  if (val < 10) return 'Low';
  if (val < 50) return 'Moderate';
  if (val < 200) return 'High';
  return 'Very High';
}
