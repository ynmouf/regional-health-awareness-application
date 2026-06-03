import { geocode } from './geocoding.js';
import { fetchAirNow } from './api/airnow.js';
import { fetchAirQuality, fetchWeather, fetchSeasonalHistory } from './api/openmeteo.js';
import { fetchCDCData } from './api/cdc.js';
import { fetchHealthcare } from './api/overpass.js';
import { fetchGoogleHealthcare } from './api/googleHealthcare.js';
import { fetchGooglePollen, mergePollen } from './api/googlePollen.js';
import { fetchCMSHospitalQuality } from './api/cms.js';
import { fetchLocalHealthContext } from './api/localHealth.js';
import { fetchWastewaterSignal } from './api/wastewater.js';
import {
  scoreAirQuality, scoreInfection, scoreHealthcare, scoreClimate,
  buildRiskAssessment,
} from './scoring.js';
import { getWeights, initWeightSliders, getAlertThreshold, getActiveProfile } from './weights.js';
import { initSearch } from './ui/search.js';
import { initLightbox } from './ui/lightbox.js';
import { renderOverall, renderCategoryCard, renderRadarChart, updateRadarChart, renderRiskIntelligence } from './ui/scoreCard.js';
import { initDetailPanel, setDetailData } from './ui/detailPanel.js';
import { renderSeasonalCalendar } from './ui/seasonalCalendar.js';
import { renderLocationImages } from './ui/locationImages.js';
import { initComparePanel, openCompare } from './ui/comparePanel.js';
import { fetchCityPhotos } from './api/images.js';
import { fetchPlacePhotos } from './api/places.js';

// ── State ───────────────────────────────────────────
let weights = getWeights();
let lastResult = null;
let activeSearchId = 0;

// ── Boot ────────────────────────────────────────────
initSearch(handleSearch);
initLightbox();
initDetailPanel();
initComparePanel(compareLocation);
initWeightSliders(weights, onWeightsChanged);
initSettingsPanel();
initHeaderButtons();
checkURLCompare();

// ── Search handler ───────────────────────────────────
async function handleSearch(query, preResolved) {
  const searchId = ++activeSearchId;
  showLoading(true);
  setSearchBusy(true);
  hideResults();
  clearError();

  try {
    setLoadingStatus('Locating place…');
    setLoadingStatus('Fetching air quality, health & climate data…');
    const assessment = await buildAssessment(query, preResolved, { includePhotos: true, includeSeasonal: true });
    const {
      geo, airNow, airQuality, googlePollen, weather, cdc, healthcare, seasonal, photos,
      cmsQuality, localHealth, wastewater,
      airResult, infResult, hcResult, clResult, scores, overall, risk,
    } = assessment;

    if (searchId !== activeSearchId) return;
    lastResult = assessment.result;

    // Attach raw API data for detail panel
    setDetailData({
      air:        { sub: airResult.sub, timestamp: latestTimestamp(airNow, airQuality, googlePollen), source: sourceList(airNow?.source, airQuality?.source, googlePollen?.source), confidence: airResult.confidence, note: airNote(geo, airResult) },
      infection:  { sub: infResult.sub, timestamp: latestTimestamp(cdc, wastewater, localHealth), source: sourceList(hasCdcMeasurements(cdc) ? cdc?.source : null, wastewater?.source, localHealth?.source), confidence: infResult.confidence, note: infectionNote(geo, cdc, wastewater) },
      healthcare: { sub: hcResult.sub, timestamp: latestTimestamp(healthcare, cmsQuality), source: sourceList(healthcare?.source, cmsQuality?.source), confidence: hcResult.confidence },
      climate:    { sub: clResult.sub, timestamp: latestTimestamp(weather, googlePollen, seasonal), source: sourceList(weather?.source, googlePollen?.source, seasonal?.source), confidence: clResult.confidence, note: clResult.confidence === 'low' ? 'Climate/allergen data is unavailable; this category uses a neutral placeholder.' : null },
    }, geo, seasonal);

    // Render
    renderLocationImages(photos, geo.lat, geo.lon, geo.displayName, healthcare?.hospitals);
    renderOverall(geo.displayName, overall, risk, getActiveProfile());
    renderRiskIntelligence(risk);
    renderCategoryCard('air',        airResult.score,  airSummary(airResult.sub, airNow),  airResult.confidence);
    renderCategoryCard('infection',  infResult.score,  infSummary(infResult.sub, cdc, wastewater, localHealth), infResult.confidence);
    renderCategoryCard('healthcare', hcResult.score,   hcSummary(hcResult.sub, healthcare), hcResult.confidence);
    renderCategoryCard('climate',    clResult.score,   clSummary(clResult.sub, weather),    clResult.confidence);
    renderRadarChart(scores);
    renderSeasonalCalendar(seasonal);

    const now = new Date();
    const sources = [
      airNow?.source,
      airQuality?.source,
      weather?.source,
      hasCdcMeasurements(cdc) ? cdc?.source : null,
      wastewater?.source,
      localHealth?.source,
      healthcareHasData(healthcare) ? healthcare?.source : null,
      cmsQuality?.source,
      googlePollen?.source,
      seasonal?.source,
    ].filter(Boolean);
    document.getElementById('data-footnote').textContent =
      `Data retrieved ${now.toLocaleString()} · Sources used: ${[...new Set(sources)].join(', ') || 'No live measurements available'}`;

    showResults();
    enableHeaderButtons();
    checkAlertThreshold(overall, geo.displayName);

    // Update URL for shareability
    const url = new URL(window.location);
    url.searchParams.set('q', geo.displayName);
    window.history.replaceState({}, '', url);

  } catch (err) {
    if (searchId !== activeSearchId) return;
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    if (searchId === activeSearchId) {
      showLoading(false);
      setSearchBusy(false);
    }
  }
}

async function buildAssessment(query, preResolved, options = {}) {
  const { includePhotos = false, includeSeasonal = false } = options;
  const geo = preResolved
    ? { ...preResolved, displayName: preResolved.displayName ?? preResolved.label }
    : await geocode(query);

  const [airNow, openMeteoAQ, googlePollen, weather, cdc, healthcare, seasonal, localHealth, wastewater, photos] = await Promise.all([
    geo.countryCode === 'US' ? fetchAirNow(geo.lat, geo.lon) : Promise.resolve(null),
    fetchAirQuality(geo.lat, geo.lon),
    fetchGooglePollen(geo.lat, geo.lon, getGooglePollenKey()),
    fetchWeather(geo.lat, geo.lon),
    geo.countryCode === 'US' ? fetchCDCData(geo.stateCode) : Promise.resolve(null),
    fetchBestHealthcare(geo.lat, geo.lon),
    includeSeasonal ? fetchSeasonalHistory(geo.lat, geo.lon) : Promise.resolve(null),
    geo.countryCode === 'US' ? fetchLocalHealthContext(geo) : Promise.resolve(null),
    geo.countryCode === 'US' ? fetchWastewaterSignal(geo) : Promise.resolve(null),
    includePhotos ? fetchPlacePhotos(geo.displayName, getGooglePlacesKey()).then(r => r || fetchCityPhotos(geo.displayName)) : Promise.resolve(null),
  ]);
  const cmsQuality = geo.countryCode === 'US'
    ? await fetchCMSHospitalQuality(geo.stateCode, healthcare?.hospitals)
    : null;
  const airQuality = mergePollen(openMeteoAQ, googlePollen);

  const airResult = scoreAirQuality(airNow, airQuality, seasonal, geo);
  const infResult = scoreInfection(cdc, wastewater, localHealth);
  const hcResult  = scoreHealthcare(healthcare, cmsQuality);
  const clResult  = scoreClimate(weather, airQuality, seasonal);
  const scores = {
    air: airResult.score,
    infection: infResult.score,
    healthcare: hcResult.score,
    climate: clResult.score,
  };
  const categoryResults = { air: airResult, infection: infResult, healthcare: hcResult, climate: clResult };
  const data = { airNow, airQuality, googlePollen, weather, cdc, healthcare, seasonal, cmsQuality, localHealth, wastewater };
  const risk = buildRiskAssessment({ scores, categoryResults, data, geo, weights, profile: getActiveProfile() });
  const overall = risk.overall;

  return {
    geo, airNow, airQuality, googlePollen, weather, cdc, healthcare, seasonal, photos,
    cmsQuality, localHealth, wastewater,
    airResult, infResult, hcResult, clResult, scores, overall, risk,
    result: { location: geo.displayName, overall, scores, geo, risk, categoryResults, data },
  };
}

async function compareLocation(query) {
  const assessment = await buildAssessment(query, null, { includePhotos: false, includeSeasonal: true });
  return assessment.result;
}

async function fetchBestHealthcare(lat, lon) {
  const google = await fetchGoogleHealthcare(lat, lon, getGooglePlacesKey());
  return google || fetchHealthcare(lat, lon);
}

function getGooglePlacesKey() {
  return window.GOOGLE_PLACES_KEY || window.GOOGLE_MAPS_KEY || '';
}

function getGooglePollenKey() {
  return window.GOOGLE_POLLEN_KEY || window.GOOGLE_MAPS_KEY || '';
}

// ── Weight change handler ────────────────────────────
function onWeightsChanged(newWeights) {
  Object.assign(weights, newWeights);
  if (!lastResult) return;
  const risk = buildRiskAssessment({
    scores: lastResult.scores,
    categoryResults: lastResult.categoryResults,
    data: lastResult.data,
    geo: lastResult.geo,
    weights,
    profile: getActiveProfile(),
  });
  const overall = risk.overall;
  lastResult.overall = overall;
  lastResult.risk = risk;
  renderOverall(lastResult.location, overall, risk, getActiveProfile());
  renderRiskIntelligence(risk);
  updateRadarChart(lastResult.scores);
}

// ── Settings panel ───────────────────────────────────
function initSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('panel-overlay');
  const btn = document.getElementById('btn-settings');
  const close = document.getElementById('settings-close');

  btn.addEventListener('click', () => {
    panel.hidden = false;
    overlay.hidden = false;
    close.focus();
  });
  close.addEventListener('click', closeSettings);
  overlay.addEventListener('click', e => {
    if (!e.target.closest('.detail-panel')) closeSettings();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });
}

function closeSettings() {
  document.getElementById('settings-panel').hidden = true;
  // Only hide overlay if detail panel is also hidden
  if (document.getElementById('detail-panel').hidden) {
    document.getElementById('panel-overlay').hidden = true;
  }
}

// ── Header buttons ───────────────────────────────────
function initHeaderButtons() {
  document.getElementById('btn-export').addEventListener('click', () => window.print());

  document.getElementById('btn-compare').addEventListener('click', () => {
    if (!lastResult) return;
    openCompare(lastResult);
  });
}

function enableHeaderButtons() {
  document.getElementById('btn-export').disabled = false;
  document.getElementById('btn-compare').disabled = false;
}

// ── Alert threshold check ────────────────────────────
function checkAlertThreshold(score, location) {
  const threshold = getAlertThreshold();
  if (threshold == null) return;
  const banner = document.getElementById('alert-banner');
  if (score < threshold) {
    banner.textContent = `⚠️ Alert: ${location} has a safety score of ${score}, which is below your threshold of ${threshold}.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

// ── URL compare auto-load ────────────────────────────
function checkURLCompare() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (q) {
    document.getElementById('search-input').value = q;
    handleSearch(q, null);
  }
}

// ── UI helpers ───────────────────────────────────────
function showLoading(show) {
  document.getElementById('loading-section').hidden = !show;
}
function hideResults() {
  document.getElementById('results-section').hidden = true;
}
function showResults() {
  document.getElementById('results-section').hidden = false;
}
function setLoadingStatus(msg) {
  document.getElementById('loading-status').textContent = msg;
}
function setSearchBusy(busy) {
  const btn = document.getElementById('btn-search');
  btn.disabled = busy;
  btn.textContent = busy ? 'Searching...' : 'Search';
}
function clearError() {
  const el = document.getElementById('error-container');
  if (el) el.remove();
}
function showError(msg) {
  clearError();
  const div = document.createElement('div');
  div.id = 'error-container';
  div.className = 'error-msg results-section';
  div.style.maxWidth = '1100px';
  div.style.margin = '2rem auto';
  div.style.padding = '0 1.5rem';
  div.innerHTML = `
    <div class="error-icon">⚠️</div>
    <h3>Couldn't load data</h3>
    <p>${escHtml(msg)}</p>
  `;
  document.getElementById('main').appendChild(div);
}

// ── Summary builders ─────────────────────────────────
function airSummary(sub, airNow) {
  const source = airNow ? 'AirNow (EPA)' : 'Open-Meteo';
  const pollenSource = sub?.pollenSource ? ` via ${sub.pollenSource}` : '';
  const pm25 = sub?.pm25 != null ? `PM2.5 ${sub.pm25.toFixed(1)} µg/m³` : 'PM2.5 unavailable';
  const pollen = sub?.pollenLevel != null ? sub.pollenLevel : 'unavailable';
  if (sub?.aqi != null) return `AQI ${sub.aqi} (${source}) · ${pm25} · Pollen: ${pollen}${pollenSource}`;
  if (sub?.pm25 != null) return `${pm25} · Pollen: ${pollen}${pollenSource} · AQI unavailable`;
  if (sub?.pollenLevel != null) return `Pollen: ${pollen}${pollenSource} · AQI and PM2.5 unavailable`;
  return 'Air quality and pollen data unavailable.';
}

function infSummary(sub, cdc, wastewater, localHealth) {
  if (!cdc && !wastewater && !localHealth) return 'CDC data not available for this location (US only).';
  const parts = [];
  if (sub?.ariLevel) parts.push(`ARI ${sub.ariLevel}`);
  if (sub?.combinedHospRate != null) parts.push(`Resp hosp ${sub.combinedHospRate.toFixed(1)}/100k`);
  if (sub?.covidHospRate != null) parts.push(`COVID ${sub.covidHospRate.toFixed(1)}/100k`);
  if (sub?.wastewaterPercentile != null) parts.push(`Wastewater p${sub.wastewaterPercentile.toFixed(0)}`);
  if (sub?.asthmaRate != null) parts.push(`Asthma ${sub.asthmaRate.toFixed(1)}%`);
  return parts.length ? parts.join(' · ') + ' (state-level)' : 'CDC infection data unavailable or incomplete for this state.';
}

function hcSummary(sub, overpass) {
  if (!overpass || (sub?.hospitalCount == null && sub?.nearestHospitalKm == null)) return 'Healthcare facility data unavailable.';
  const spec = sub.hasSpecialist ? 'Specialist nearby ✓' : 'No specialist found';
  const hospital = sub.estimatedHospitalDriveMinutes != null
    ? `Hospital ~${sub.estimatedHospitalDriveMinutes} min`
    : sub.nearestHospitalKm != null
      ? `Nearest hospital ${sub.nearestHospitalKm.toFixed(1)} km`
    : `${sub.hospitalCount} hospital${sub.hospitalCount !== 1 ? 's' : ''}`;
  const quality = sub.cmsAvgRating != null
    ? `CMS ${sub.cmsAvgRating.toFixed(1)} stars`
    : sub.qualityProxyScore != null
      ? `quality proxy ${sub.qualityProxyScore}/100`
      : 'quality unrated';
  const pharmacies = sub.pharmacyCount > 0
    ? `${sub.pharmacyCount} pharmac${sub.pharmacyCount !== 1 ? 'ies' : 'y'}`
    : 'no nearby pharmacies';
  return `${hospital} · ${quality} · ${pharmacies} · ${spec}`;
}

function clSummary(sub, weather) {
  if (!weather && sub?.pollenLevel == null) return 'Climate and pollen data unavailable.';
  const humidity = sub?.humidity != null ? `${sub.humidity.toFixed(0)}%` : 'unavailable';
  const tempRange = sub?.tempRange != null ? `±${sub.tempRange.toFixed(1)}°C` : 'unavailable';
  const pollen = sub?.pollenLevel != null ? sub.pollenLevel : 'unavailable';
  const tail = sub?.tailRiskScore != null ? ` · Tail risk ${sub.tailRiskScore}` : '';
  return `Humidity ${humidity} · Temp range ${tempRange} · Pollen: ${pollen}${tail}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sourceList(...sources) {
  return [...new Set(sources.filter(Boolean))].join(', ') || null;
}

function latestTimestamp(...items) {
  const times = items.map(item => item?.timestamp).filter(Boolean).sort();
  return times.at(-1) ?? null;
}

function hasCdcMeasurements(cdc) {
  return !!cdc && [
    cdc.ariLevel,
    cdc.combinedHospRate,
    cdc.covidHospRate,
    cdc.fluHospRate,
    cdc.rsvHospRate,
  ].some(v => v != null);
}

function healthcareHasData(healthcare) {
  return !!healthcare && (
    healthcare.nearestHospitalKm != null ||
    healthcare.hospitalCount != null ||
    healthcare.pharmacyCount != null
  );
}

function airNote(geo, airResult) {
  if (airResult.confidence === 'low') return 'Air quality/allergen data is unavailable; this category uses a neutral placeholder.';
  if (geo.countryCode !== 'US') return 'AirNow data is US-only; using modeled AQI where available.';
  return null;
}

function infectionNote(geo, cdc, wastewater) {
  if (geo.countryCode !== 'US') return 'CDC disease data is US-only — not available for this location.';
  if (!hasCdcMeasurements(cdc)) return 'CDC infection data is unavailable or incomplete; this category uses a neutral placeholder.';
  if (wastewater?.note) return wastewater.note;
  return cdc?.note ?? null;
}
