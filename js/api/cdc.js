import { cacheGet, cacheSet } from '../utils/cache.js';
import { STATE_TO_HHS } from '../utils/regionMap.js';

const SODA = 'https://data.cdc.gov/resource';

/* Fetches flu ILI%, vaccination rate, and COVID hospitalization data for a US state */
export async function fetchCDCData(stateCode) {
  if (!stateCode) return null;

  const cacheKey = `cdc_${stateCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const [flu, vax, covid] = await Promise.allSettled([
    fetchFluILI(stateCode),
    fetchVaxRate(stateCode),
    fetchCovidHospitalization(stateCode),
  ]);

  const result = {
    fluILI: flu.status === 'fulfilled' ? flu.value : null,
    vaxRate: vax.status === 'fulfilled' ? vax.value : null,
    covidHosp: covid.status === 'fulfilled' ? covid.value : null,
    stateCode,
    source: 'CDC (data.cdc.gov)',
    confidence: 'medium',
    note: 'Data reflects state-level averages, not your specific city.',
    timestamp: new Date().toISOString(),
  };

  cacheSet(cacheKey, result, 12 * 60 * 60 * 1000); // 12h — CDC updates weekly
  return result;
}

async function fetchFluILI(stateCode) {
  try {
    // ILINet data — % of outpatient visits for influenza-like illness
    const url = `${SODA}/u6jv-9uzb.json?$where=region_type='State' AND region='${stateCode}'&$order=week_end DESC&$limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const ili = parseFloat(data[0].weighted_ili ?? data[0].unweighted_ili ?? data[0]['%_weighted_ili'] ?? 0);
    return isNaN(ili) ? null : ili;
  } catch { return null; }
}

async function fetchVaxRate(stateCode) {
  try {
    // Flu vaccination coverage by state (adults 18+)
    const url = `${SODA}/vh55-3he6.json?geography='${stateCode}'&$order=survey_year_season DESC&$limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return tryCovidVaxFallback(stateCode);
    const rate = parseFloat(data[0].estimate ?? data[0].coverage ?? 0);
    return isNaN(rate) ? null : rate;
  } catch { return tryCovidVaxFallback(stateCode); }
}

async function tryCovidVaxFallback(stateCode) {
  try {
    // COVID vaccination (adults) as a proxy for general vaccination culture
    const url = `${SODA}/rh2h-3yt2.json?location='${stateCode}'&date_type=Admin&$order=date DESC&$limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const rate = parseFloat(data[0].administered_dose1_pop_pct ?? 0);
    return isNaN(rate) ? null : rate;
  } catch { return null; }
}

async function fetchCovidHospitalization(stateCode) {
  try {
    // COVID-NET: lab-confirmed COVID hospitalizations per 100k
    const url = `${SODA}/aemt-mg7g.json?state='${stateCode}'&$order=week_end_date DESC&$limit=2`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const rate = parseFloat(data[0].weekly_rate ?? 0);
    return isNaN(rate) ? null : rate;
  } catch { return null; }
}
