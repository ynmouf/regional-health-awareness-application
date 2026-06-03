/**
 * EPA EJScreen REST API
 * https://ejscreen.epa.gov/mapper/ejscreenRESTbroker.aspx
 *
 * Free, no API key, official EPA data, full US coverage.
 * Returns national-percentile environmental burden indicators for a lat/lon radius.
 * Percentiles: 0 = least burdened, 100 = most burdened (we invert for scoring).
 */

import { cacheGet, cacheSet } from '../utils/cache.js';

const ENDPOINT = 'https://ejscreen.epa.gov/mapper/ejscreenRESTbroker.aspx';
const RADIUS_MILES = 5;

/**
 * Returns { cancer, resp, superfund, chemFacility, trafficPM, wastewater,
 *           rawPercentiles, source, confidence, timestamp }
 * All values are 0–100 national percentiles (higher = worse burden).
 * Returns null for non-US locations.
 */
export async function fetchEJScreen(lat, lon, countryCode) {
  if (countryCode && countryCode !== 'US') return null;

  const key = `ejscreen_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const geometry = JSON.stringify({ spatialReference: { wkid: 4326 }, x: lon, y: lat });
    const params = new URLSearchParams({
      namestr: '',
      geometry,
      distance: RADIUS_MILES,
      unit: '9035', // miles
      areatype: '',
      areaid: '',
      f: 'json',
      showDesc: 'false',
    });

    const res = await fetch(`${ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(`EJScreen ${res.status}`);
    const data = await res.json();

    // EJScreen returns an array of block group results — average across them
    const rows = data?.blockgrp_results ?? data?.features ?? [];
    if (!rows.length) return null;

    // Pull national percentile fields (P_ prefix = national, higher = worse)
    const avg = (field) => {
      const vals = rows
        .map(r => parseFloat(r.fields?.[field] ?? r[field] ?? r.attributes?.[field]))
        .filter(v => !isNaN(v) && v >= 0);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    const cancer     = avg('P_CANCER');
    const resp       = avg('P_RESP');
    const superfund  = avg('P_NPL');
    const chemFacility = avg('P_RMP');
    const trafficPM  = avg('P_PTRAF');
    const wastewater = avg('P_PWDIS');
    const tsdf       = avg('P_TSDF'); // treatment/storage/disposal facilities

    // Confidence: high if we have the two most important metrics
    const hasCore = cancer != null && resp != null;
    const hasSupplemental = superfund != null || chemFacility != null;

    const result = {
      cancer, resp, superfund, chemFacility, trafficPM, wastewater, tsdf,
      rawPercentiles: { cancer, resp, superfund, chemFacility, trafficPM, wastewater, tsdf },
      source: 'EPA EJScreen',
      sourceUrl: 'https://ejscreen.epa.gov/',
      confidence: hasCore ? (hasSupplemental ? 'high' : 'medium') : 'low',
      timestamp: new Date().toISOString(),
      radiusMiles: RADIUS_MILES,
    };

    cacheSet(key, result, 7 * 24 * 60 * 60 * 1000); // 7 days — EPA updates annually
    return result;
  } catch {
    return null;
  }
}
