import { geocode } from './geocoding.js';
import { fetchAirNow } from './api/airnow.js';
import { fetchAirQuality, fetchWeather, fetchSeasonalHistory } from './api/openmeteo.js';
import { fetchCDCData } from './api/cdc.js';
import { fetchHealthcare } from './api/overpass.js';
import { fetchGoogleHealthcare } from './api/googleHealthcare.js';
import { fetchGooglePollen, mergePollen } from './api/googlePollen.js';
import {
  scoreAirQuality, scoreInfection, scoreHealthcare, scoreClimate,
  scoreOverall, scoreLabel,
} from './scoring.js';
import { getWeights, saveWeights, initWeightSliders, getAlertThreshold } from './weights.js';
import { initSearch } from './ui/search.js';
import { initLightbox } from './ui/lightbox.js';
import { renderOverall, renderCategoryCard, renderRadarChart, updateRadarChart } from './ui/scoreCard.js';
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
      airResult, infResult, hcResult, clResult, scores, overall,
    } = assessment;

    if (searchId !== activeSearchId) return;
    lastResult = assessment.result;

    // Attach raw API data for detail panel
    setDetailData({
      air:        { sub: airResult.sub, timestamp: airQuality?.timestamp, source: googlePollen ? 'AirNow (EPA), Open-Meteo, and Google Pollen API' : null, confidence: airResult.confidence, note: geo.countryCode !== 'US' ? 'AirNow data is US-only; using modeled AQI.' : null },
      infection:  { sub: infResult.sub, timestamp: cdc?.timestamp, source: cdc?.source, confidence: infResult.confidence, note: cdc?.note ?? (geo.countryCode !== 'US' ? 'CDC disease data is US-only — not available for this location.' : null) },
      healthcare: { sub: hcResult.sub, timestamp: healthcare?.timestamp, source: healthcare?.source, confidence: hcResult.confidence },
      climate:    { sub: clResult.sub, timestamp: weather?.timestamp, source: googlePollen ? 'Open-Meteo Weather and Google Pollen API' : null, confidence: clResult.confidence },
    }, geo, seasonal);

    // Render
    renderLocationImages(photos, geo.lat, geo.lon, geo.displayName, healthcare?.hospitals);
    renderOverall(geo.displayName, overall);
    renderCategoryCard('air',        airResult.score,  airSummary(airResult.sub, airNow),  airResult.confidence);
    renderCategoryCard('infection',  infResult.score,  infSummary(infResult.sub, cdc),      infResult.confidence);
    renderCategoryCard('healthcare', hcResult.score,   hcSummary(hcResult.sub, healthcare), hcResult.confidence);
    renderCategoryCard('climate',    clResult.score,   clSummary(clResult.sub, weather),    clResult.confidence);
    renderRadarChart(scores);
    renderSeasonalCalendar(seasonal);

    const now = new Date();
    const sources = [airNow ? 'AirNow (EPA)' : 'Open-Meteo', 'Open-Meteo'];
    if (cdc) sources.push('CDC');
    if (healthcare?.source) sources.push(healthcare.source);
    if (googlePollen) sources.push('Google Pollen');
    document.getElementById('data-footnote').textContent =
      `Data retrieved ${now.toLocaleString()} · Sources: ${[...new Set(sources)].join(', ')}`;

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

  const [airNow, openMeteoAQ, googlePollen, weather, cdc, healthcare, seasonal, photos] = await Promise.all([
    geo.countryCode === 'US' ? fetchAirNow(geo.lat, geo.lon) : Promise.resolve(null),
    fetchAirQuality(geo.lat, geo.lon),
    fetchGooglePollen(geo.lat, geo.lon, getGooglePollenKey()),
    fetchWeather(geo.lat, geo.lon),
    geo.countryCode === 'US' ? fetchCDCData(geo.stateCode) : Promise.resolve(null),
    fetchBestHealthcare(geo.lat, geo.lon),
    includeSeasonal ? fetchSeasonalHistory(geo.lat, geo.lon) : Promise.resolve(null),
    includePhotos ? fetchPlacePhotos(geo.displayName, getGooglePlacesKey()).then(r => r || fetchCityPhotos(geo.displayName)) : Promise.resolve(null),
  ]);
  const airQuality = mergePollen(openMeteoAQ, googlePollen);

  const airResult = scoreAirQuality(airNow, airQuality);
  const infResult = scoreInfection(cdc);
  const hcResult  = scoreHealthcare(healthcare);
  const clResult  = scoreClimate(weather, airQuality);
  const scores = {
    air: airResult.score,
    infection: infResult.score,
    healthcare: hcResult.score,
    climate: clResult.score,
  };
  const overall = scoreOverall(scores, weights);

  return {
    geo, airNow, airQuality, googlePollen, weather, cdc, healthcare, seasonal, photos,
    airResult, infResult, hcResult, clResult, scores, overall,
    result: { location: geo.displayName, overall, scores, geo },
  };
}

async function compareLocation(query) {
  const assessment = await buildAssessment(query, null, { includePhotos: false, includeSeasonal: false });
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
  const overall = scoreOverall(lastResult.scores, weights);
  lastResult.overall = overall;
  renderOverall(lastResult.location, overall);
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
  if (sub?.aqi != null) return `AQI ${sub.aqi} (${source}) · ${pm25} · Pollen: ${sub.pollenLevel ?? 'Unknown'}${pollenSource}`;
  if (sub?.pm25 != null) return `${pm25} · Pollen: ${sub.pollenLevel ?? 'Unknown'}${pollenSource} · AQI unavailable`;
  return `Pollen: ${sub?.pollenLevel ?? 'Unknown'} · AQI data unavailable`;
}

function infSummary(sub, cdc) {
  if (!cdc) return 'CDC data not available for this location (US only).';
  const parts = [];
  if (sub?.ariLevel) parts.push(`ARI ${sub.ariLevel}`);
  if (sub?.combinedHospRate != null) parts.push(`Resp hosp ${sub.combinedHospRate.toFixed(1)}/100k`);
  if (sub?.covidHospRate != null) parts.push(`COVID ${sub.covidHospRate.toFixed(1)}/100k`);
  return parts.length ? parts.join(' · ') + ' (state-level)' : 'Limited CDC data available.';
}

function hcSummary(sub, overpass) {
  if (!overpass || (sub?.hospitalCount == null && sub?.nearestHospitalKm == null)) return 'Healthcare facility data unavailable.';
  const spec = sub.hasSpecialist ? 'Specialist nearby ✓' : 'No specialist found';
  const hospital = sub.nearestHospitalKm != null
    ? `Nearest hospital ${sub.nearestHospitalKm.toFixed(1)} km`
    : `${sub.hospitalCount} hospital${sub.hospitalCount !== 1 ? 's' : ''}`;
  const pharmacies = sub.pharmacyCount > 0
    ? `${sub.pharmacyCount} pharmac${sub.pharmacyCount !== 1 ? 'ies' : 'y'}`
    : 'no nearby pharmacies';
  return `${hospital} · ${pharmacies} · ${spec}`;
}

function clSummary(sub, weather) {
  if (!weather) return 'Climate data unavailable.';
  return `Humidity ${sub?.humidity?.toFixed(0) ?? '?'}% · Temp range ±${sub?.tempRange?.toFixed(1) ?? '?'}°C · Pollen: ${sub?.pollenLevel ?? 'Unknown'}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
