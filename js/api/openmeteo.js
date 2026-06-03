import { cacheGet, cacheSet } from '../utils/cache.js';

const AQ_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WX_BASE = 'https://api.open-meteo.com/v1/forecast';
const HIST_BASE = 'https://archive-api.open-meteo.com/v1/archive';

/* Air quality: AQI, PM2.5, PM10, pollen */
export async function fetchAirQuality(lat, lon) {
  const key = `om_aq_v2_${lat.toFixed(2)}_${lon.toFixed(2)}`;
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

    const nowIdx = currentHourlyIndex(d.hourly.time, d.utc_offset_seconds);
    const aqi = firstValid(h.us_aqi, nowIdx);
    const pm25 = firstValid(h.pm2_5, nowIdx);
    const pm10 = firstValid(h.pm10, nowIdx);
    const grassPollen = firstValid(h.grass_pollen, nowIdx);
    const ragweedPollen = firstValid(h.ragweed_pollen, nowIdx);
    const birchPollen = firstValid(h.birch_pollen, nowIdx);

    const pollenValues = [grassPollen, ragweedPollen, birchPollen].filter(v => v != null && !isNaN(v));
    const maxPollen = pollenValues.length ? Math.max(...pollenValues) : null;

    const result = {
      aqi: aqi ?? null,
      pm25: pm25 ?? null,
      pm10: pm10 ?? null,
      pollenRaw: maxPollen,
      pollenLevel: pollenLabel(maxPollen),
      grassPollen, ragweedPollen, birchPollen,
      source: 'Open-Meteo',
      confidence: aqi != null || pm25 != null ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 2 * 60 * 60 * 1000);
    return result;
  } catch { return null; }
}

/* Weather: humidity, temperature extremes */
export async function fetchWeather(lat, lon) {
  const key = `om_wx_v2_${lat.toFixed(2)}_${lon.toFixed(2)}`;
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
    const startIdx = Math.max(0, currentHourlyIndex(d.hourly.time, d.utc_offset_seconds));
    const humiditySlice = d.hourly.relativehumidity_2m.slice(startIdx, startIdx + 24);
    const avgHumidity = avg(humiditySlice);

    // 7-day average daily temp range
    const tempRanges = d.daily.temperature_2m_max.map(
      (max, i) => max - d.daily.temperature_2m_min[i]
    );
    const avgTempRange = avg(tempRanges);
    const maxTemp = maxValid(d.daily.temperature_2m_max);
    const minTemp = minValid(d.daily.temperature_2m_min);

    const result = {
      avgHumidity, avgTempRange, maxTemp, minTemp,
      source: 'Open-Meteo',
      confidence: avgHumidity != null || avgTempRange != null ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 6 * 60 * 60 * 1000);
    return result;
  } catch { return null; }
}

/* Historical monthly data for seasonal calendar — returns array of 12 monthly scores */
export async function fetchSeasonalHistory(lat, lon) {
  const key = `om_hist_v2_${lat.toFixed(1)}_${lon.toFixed(1)}`;
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
  if (!Array.isArray(arr)) return null;
  for (let i = startIdx; i >= 0; i--) {
    if (arr[i] != null) return arr[i];
  }
  return arr.find(v => v != null) ?? null;
}

function avg(arr) {
  if (!Array.isArray(arr)) return null;
  const valid = arr.filter(v => v != null && !isNaN(v));
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

function currentHourlyIndex(times, utcOffsetSeconds = 0) {
  if (!Array.isArray(times) || !times.length) return 0;
  const localNow = new Date(Date.now() + (utcOffsetSeconds || 0) * 1000);
  const target = `${localNow.getUTCFullYear()}-${pad2(localNow.getUTCMonth() + 1)}-${pad2(localNow.getUTCDate())}T${pad2(localNow.getUTCHours())}:00`;
  const exactIdx = times.indexOf(target);
  if (exactIdx >= 0) return exactIdx;

  const now = parseOpenMeteoLocalTime(target);
  let bestIdx = 0;
  let bestDiff = Infinity;
  times.forEach((time, i) => {
    const t = parseOpenMeteoLocalTime(time);
    if (!Number.isFinite(t)) return;
    const diff = Math.abs(now - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseOpenMeteoLocalTime(time) {
  const str = String(time);
  if (str.endsWith('Z')) return Date.parse(str);
  return Date.parse(`${str.length === 16 ? `${str}:00` : str}Z`);
}

function maxValid(arr) {
  const valid = Array.isArray(arr) ? arr.filter(v => v != null && !isNaN(v)) : [];
  return valid.length ? Math.max(...valid) : null;
}

function minValid(arr) {
  const valid = Array.isArray(arr) ? arr.filter(v => v != null && !isNaN(v)) : [];
  return valid.length ? Math.min(...valid) : null;
}

function pollenLabel(val) {
  if (val == null || val === 0) return 'None';
  if (val < 10) return 'Low';
  if (val < 50) return 'Moderate';
  if (val < 200) return 'High';
  return 'Very High';
}
