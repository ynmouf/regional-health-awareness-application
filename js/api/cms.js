import { cacheGet, cacheSet } from '../utils/cache.js';

const HOSPITAL_GENERAL_INFO = 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0';

export async function fetchCMSHospitalQuality(stateCode, hospitals = []) {
  if (!stateCode || !Array.isArray(hospitals) || !hospitals.length) return null;

  const key = `cms_hospitals_${stateCode.toUpperCase()}`;
  const cached = cacheGet(key);
  const rows = cached ?? await fetchStateHospitals(stateCode);
  if (!rows?.length) return null;

  const matched = hospitals
    .map(hospital => matchHospital(hospital, rows))
    .filter(Boolean);
  const ratings = matched
    .map(match => match.rating)
    .filter(rating => rating != null);

  return {
    matchedCount: matched.length,
    ratedCount: ratings.length,
    avgRating: ratings.length ? avg(ratings) : null,
    bestRating: ratings.length ? Math.max(...ratings) : null,
    hospitals: matched.slice(0, 10),
    source: 'CMS Provider Data Catalog',
    confidence: ratings.length ? 'medium' : 'low',
    timestamp: new Date().toISOString(),
  };
}

async function fetchStateHospitals(stateCode) {
  try {
    const params = new URLSearchParams({
      limit: '500',
      'conditions[0][property]': 'state',
      'conditions[0][value]': stateCode.toUpperCase(),
      'conditions[0][operator]': '=',
    });
    const res = await fetch(`${HOSPITAL_GENERAL_INFO}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.results ?? [];
    cacheSet(`cms_hospitals_${stateCode.toUpperCase()}`, rows, 7 * 24 * 60 * 60 * 1000);
    return rows;
  } catch {
    return null;
  }
}

function matchHospital(hospital, rows) {
  const name = normalizeName(hospital.name);
  if (!name) return null;

  const scored = rows
    .map(row => ({
      row,
      score: nameSimilarity(name, normalizeName(row.facility_name)),
    }))
    .filter(match => match.score >= 0.52)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  return {
    name: best.row.facility_name,
    rating: parseRating(best.row.hospital_overall_rating),
    city: best.row.citytown,
    state: best.row.state,
    matchScore: best.score,
  };
}

function parseRating(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(the|hospital|medical|center|centre|health|system|campus|inc|llc|regional)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const aWords = new Set(a.split(/\s+/).filter(Boolean));
  const bWords = new Set(b.split(/\s+/).filter(Boolean));
  const overlap = [...aWords].filter(word => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size || 1;
  return overlap / union;
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
