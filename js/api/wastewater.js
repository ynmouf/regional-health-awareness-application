import { cacheGet, cacheSet } from '../utils/cache.js';

const NWSS_METRICS = 'https://data.cdc.gov/resource/2ew6-ywp6.json';

export async function fetchWastewaterSignal(geo) {
  if (geo?.countryCode !== 'US' || !geo.state) return null;

  const stateName = geo.state;
  const key = `nwss_${stateName.toLowerCase().replace(/\W+/g, '_')}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      '$select': 'date_end,percentile,county_names,reporting_jurisdiction',
      '$where': `reporting_jurisdiction='${stateName.replace(/'/g, "''")}' AND percentile IS NOT NULL`,
      '$order': 'date_end DESC',
      '$limit': '50',
    });
    const res = await fetch(`${NWSS_METRICS}?${params}`);
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const latestDate = rows[0].date_end;
    const latestRows = rows.filter(row => row.date_end === latestDate);
    const percentiles = latestRows
      .map(row => Number.parseFloat(row.percentile))
      .filter(Number.isFinite);
    if (!percentiles.length) return null;

    const result = {
      latestDate,
      avgPercentile: avg(percentiles),
      maxPercentile: Math.max(...percentiles),
      sites: latestRows.length,
      source: 'CDC NWSS wastewater',
      confidence: isStale(latestDate) ? 'low' : 'medium',
      timestamp: new Date().toISOString(),
      note: isStale(latestDate) ? 'Wastewater data is not recent; use as context only.' : null,
    };
    cacheSet(key, result, 24 * 60 * 60 * 1000);
    return result;
  } catch {
    return null;
  }
}

function isStale(dateString) {
  const date = Date.parse(dateString);
  if (!Number.isFinite(date)) return true;
  return Date.now() - date > 45 * 24 * 60 * 60 * 1000;
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
