/**
 * EPA Safe Drinking Water Information System (SDWIS) via data.epa.gov/efservice
 * Free, CORS-enabled, official federal data, US coverage.
 * Returns violation and compliance data for public water systems in a city/state.
 *
 * Immunocompromised relevance: Cryptosporidium, Giardia, Legionella, lead, nitrates,
 * and PFAS are all disproportionately dangerous when the immune system cannot compensate.
 */

import { cacheGet, cacheSet } from '../utils/cache.js';

const BASE = 'https://data.epa.gov/efservice';
const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

export async function fetchWaterSafety(stateCode, cityName, zipCode) {
  if (!stateCode) return null;

  const cacheKey = `water_${stateCode}_${(cityName || zipCode || '').toLowerCase().replace(/\W+/g, '_')}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    // Step 1: find active community water systems serving this area
    const systems = await findWaterSystems(stateCode, cityName, zipCode);
    if (!systems.length) return await stateWideFallback(stateCode);

    // Step 2: fetch violations for the top 3 systems by population served
    const top = systems.sort((a, b) => b.pop - a.pop).slice(0, 3);
    const violationArrays = await Promise.all(top.map(s => fetchPWSViolations(s.pwsid)));
    const allViolations = violationArrays.flat();

    const cutoff = Date.now() - FIVE_YEARS_MS;
    const recentHealth = allViolations.filter(v =>
      v.healthBased && new Date(v.beginDate).getTime() > cutoff
    );
    const tier1 = recentHealth.filter(v => v.tier === 1);
    const outstandingCount = systems.filter(s => s.outstanding).length;

    const result = build(systems, recentHealth.length, tier1.length, outstandingCount);
    cacheSet(cacheKey, result, 7 * 24 * 60 * 60 * 1000); // 7 days
    return result;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findWaterSystems(stateCode, cityName, zipCode) {
  // Try ZIP first (more precise), then city name
  const queries = [];
  if (zipCode) queries.push(
    `${BASE}/WATER_SYSTEM/PRIMACY_AGENCY_CODE/${stateCode}/ZIP_CODE/${zipCode}/PWS_ACTIVITY_CODE/A/PWS_TYPE_CODE/CWS/rows/0:10`
  );
  if (cityName) queries.push(
    `${BASE}/WATER_SYSTEM/PRIMACY_AGENCY_CODE/${stateCode}/CITY_NAME/${encodeURIComponent(cityName.toUpperCase())}/PWS_ACTIVITY_CODE/A/PWS_TYPE_CODE/CWS/rows/0:10`
  );

  for (const url of queries) {
    const systems = await fetchAndParseXML(url, parseWaterSystem, 'water_system');
    if (systems.length) return systems;
  }
  return [];
}

async function stateWideFallback(stateCode) {
  // Count health-based violations state-wide for the last 5 years
  const cutoff = new Date(Date.now() - FIVE_YEARS_MS).toISOString().split('T')[0];
  const url = `${BASE}/VIOLATION/PRIMACY_AGENCY_CODE/${stateCode}/IS_HEALTH_BASED_IND/Y/rows/0:200`;
  try {
    const violations = await fetchAndParseXML(url, parseViolation, 'violation');
    const recent = violations.filter(v => new Date(v.beginDate).getTime() > Date.now() - FIVE_YEARS_MS);
    const tier1 = recent.filter(v => v.tier === 1);
    return build([], recent.length, tier1.length, 0, true);
  } catch { return null; }
}

async function fetchPWSViolations(pwsid) {
  const url = `${BASE}/VIOLATION/PWSID/${pwsid}/IS_HEALTH_BASED_IND/Y/rows/0:50`;
  try {
    return await fetchAndParseXML(url, parseViolation, 'violation');
  } catch { return []; }
}

function build(systems, healthViolations5yr, tier1Count, outstandingCount, stateLevel = false) {
  return {
    systemCount: systems.length,
    healthViolations5yr,
    tier1Count,
    outstandingCount,
    outstandingPct: systems.length ? Math.round((outstandingCount / systems.length) * 100) : null,
    stateLevel,
    source: 'EPA SDWIS',
    sourceUrl: 'https://www.epa.gov/ground-water-and-drinking-water',
    confidence: healthViolations5yr >= 0 ? (stateLevel ? 'medium' : 'high') : 'low',
    note: stateLevel ? 'Using state-wide water violation data; city-level system not found.' : null,
    timestamp: new Date().toISOString(),
  };
}

async function fetchAndParseXML(url, parseFn, tagName) {
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  return [...doc.querySelectorAll(tagName)].map(parseFn).filter(Boolean);
}

function parseWaterSystem(el) {
  return {
    pwsid:       el.querySelector('PWSID')?.textContent ?? '',
    name:        el.querySelector('PWS_NAME')?.textContent ?? '',
    city:        el.querySelector('CITY_NAME')?.textContent ?? '',
    pop:         parseInt(el.querySelector('POPULATION_SERVED_COUNT')?.textContent ?? '0', 10),
    outstanding: el.querySelector('OUTSTANDING_PERFORMER')?.textContent === 'Y',
    sourceType:  el.querySelector('GW_SW_CODE')?.textContent ?? '',
  };
}

function parseViolation(el) {
  return {
    pwsid:      el.querySelector('PWSID')?.textContent ?? '',
    code:       el.querySelector('VIOLATION_CODE')?.textContent ?? '',
    category:   el.querySelector('VIOLATION_CATEGORY_CODE')?.textContent ?? '',
    healthBased: el.querySelector('IS_HEALTH_BASED_IND')?.textContent === 'Y',
    tier:       parseInt(el.querySelector('PUBLIC_NOTIFICATION_TIER')?.textContent ?? '3', 10),
    beginDate:  el.querySelector('COMPL_PER_BEGIN_DATE')?.textContent ?? '',
    contaminant: el.querySelector('CONTAMINANT_CODE')?.textContent ?? '',
    status:     el.querySelector('COMPLIANCE_STATUS_CODE')?.textContent ?? '',
  };
}
