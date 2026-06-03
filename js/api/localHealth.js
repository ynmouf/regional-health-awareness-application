import { cacheGet, cacheSet } from '../utils/cache.js';

const PLACES = 'https://data.cdc.gov/resource/swc5-untb.json';
const MEASURES = ['ACCESS2', 'CASTHMA', 'COPD', 'CSMOKING', 'CHECKUP'];

export async function fetchLocalHealthContext(geo) {
  if (geo?.countryCode !== 'US' || !geo.stateCode || !geo.county) return null;

  const county = normalizeCountyName(geo.county);
  if (!county) return null;
  const key = `places_${geo.stateCode}_${county.toLowerCase().replace(/\W+/g, '_')}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const where = [
      `stateabbr='${geo.stateCode.replace(/'/g, "''")}'`,
      `locationname='${county.replace(/'/g, "''")}'`,
      `measureid in(${MEASURES.map(id => `'${id}'`).join(',')})`,
      "datavaluetypeid='CrdPrv'",
    ].join(' AND ');
    const params = new URLSearchParams({
      '$select': 'measureid,measure,short_question_text,data_value,low_confidence_limit,high_confidence_limit',
      '$where': where,
      '$limit': '20',
    });
    const res = await fetch(`${PLACES}?${params}`);
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const measures = Object.fromEntries(rows.map(row => [row.measureid, {
      label: row.short_question_text || row.measure,
      value: numeric(row.data_value),
      low: numeric(row.low_confidence_limit),
      high: numeric(row.high_confidence_limit),
    }]));

    const result = {
      county,
      measures,
      source: 'CDC PLACES',
      confidence: Object.keys(measures).length >= 3 ? 'medium' : 'low',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 30 * 24 * 60 * 60 * 1000);
    return result;
  } catch {
    return null;
  }
}

function normalizeCountyName(value) {
  return String(value ?? '')
    .replace(/\s+(County|Parish|Borough|Municipality|city)$/i, '')
    .trim();
}

function numeric(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}
