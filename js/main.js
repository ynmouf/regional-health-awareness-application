import { geocode } from './geocoding.js';
import { fetchAirNow } from './api/airnow.js';
import { fetchAirQuality, fetchWeather, fetchSeasonalHistory } from './api/openmeteo.js';
import { fetchCDCData } from './api/cdc.js';
import { fetchHealthcare } from './api/overpass.js';
import {
  scoreAirQuality, scoreInfection, scoreHealthcare, scoreClimate,
  scoreOverall, scoreLabel,
} from './scoring.js';
import { getWeights, saveWeights, initWeightSliders, getAlertThreshold } from './weights.js';
import { initSearch } from './ui/search.js';
import { renderOverall, renderCategoryCard, renderRadarChart, updateRadarChart } from './ui/scoreCard.js';
import { initDetailPanel, setDetailData } from './ui/detailPanel.js';
import { renderSeasonalCalendar } from './ui/seasonalCalendar.js';
import { renderLocationImages } from './ui/locationImages.js';
import { addCompareResult } from './ui/comparePanel.js';
import { fetchCityPhotos } from './api/images.js';

// ── State ───────────────────────────────────────────
let weights = getWeights();
let lastResult = null;

// ── Boot ────────────────────────────────────────────
initSearch(handleSearch);
initDetailPanel();
initWeightSliders(weights, onWeightsChanged);
initSettingsPanel();
initHeaderButtons();
checkURLCompare();

// ── Search handler ───────────────────────────────────
async function handleSearch(query, preResolved) {
  showLoading(true);
  hideResults();
  clearError();

  try {
    setLoadingStatus('Locating place…');
    const geo = preResolved
      ? { ...preResolved, displayName: preResolved.displayName ?? preResolved.label }
      : await geocode(query);

    // Fire all API calls in parallel
    setLoadingStatus('Fetching air quality, health & climate data…');
    const [airNow, openMeteoAQ, weather, cdc, healthcare, seasonal, photos] = await Promise.all([
      geo.countryCode === 'US' ? fetchAirNow(geo.lat, geo.lon) : Promise.resolve(null),
      fetchAirQuality(geo.lat, geo.lon),
      fetchWeather(geo.lat, geo.lon),
      geo.countryCode === 'US' ? fetchCDCData(geo.stateCode) : Promise.resolve(null),
      fetchHealthcare(geo.lat, geo.lon),
      fetchSeasonalHistory(geo.lat, geo.lon),
      fetchCityPhotos(geo.displayName),
    ]);

    setLoadingStatus('Calculating scores…');

    const airResult = scoreAirQuality(airNow, openMeteoAQ);
    const infResult = scoreInfection(cdc);
    const hcResult  = scoreHealthcare(healthcare);
    const clResult  = scoreClimate(weather, openMeteoAQ);

    const scores = {
      air: airResult.score,
      infection: infResult.score,
      healthcare: hcResult.score,
      climate: clResult.score,
    };
    const overall = scoreOverall(scores, weights);

    lastResult = { location: geo.displayName, overall, scores, geo };

    // Attach raw API data for detail panel
    setDetailData({
      air:        { sub: airResult.sub, timestamp: openMeteoAQ?.timestamp, note: geo.countryCode !== 'US' ? 'AirNow data is US-only; using Open-Meteo AQI.' : null },
      infection:  { sub: infResult.sub, timestamp: cdc?.timestamp, note: cdc?.note ?? (geo.countryCode !== 'US' ? 'CDC disease data is US-only — not available for this location.' : null) },
      healthcare: { sub: hcResult.sub, timestamp: healthcare?.timestamp },
      climate:    { sub: clResult.sub, timestamp: weather?.timestamp },
    }, geo, seasonal);

    // Render
    renderLocationImages(photos, geo.lat, geo.lon, geo.displayName);
    renderOverall(geo.displayName, overall);
    renderCategoryCard('air',        airResult.score,  airSummary(airResult.sub, airNow),  airResult.confidence);
    renderCategoryCard('infection',  infResult.score,  infSummary(infResult.sub, cdc),      infResult.confidence);
    renderCategoryCard('healthcare', hcResult.score,   hcSummary(hcResult.sub, healthcare), hcResult.confidence);
    renderCategoryCard('climate',    clResult.score,   clSummary(clResult.sub, weather),    clResult.confidence);
    renderRadarChart(scores);
    renderSeasonalCalendar(seasonal);

    const now = new Date();
    document.getElementById('data-footnote').textContent =
      `Data retrieved ${now.toLocaleString()} · Sources: AirNow (EPA), Open-Meteo, CDC, OpenStreetMap`;

    showResults();
    enableHeaderButtons();
    checkAlertThreshold(overall, geo.displayName);

    // Update URL for shareability
    const url = new URL(window.location);
    url.searchParams.set('q', geo.displayName);
    window.history.replaceState({}, '', url);

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    showLoading(false);
  }
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
    addCompareResult(lastResult);
    document.getElementById('compare-section').scrollIntoView({ behavior: 'smooth' });
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
  if (sub?.aqi != null) return `AQI ${sub.aqi} · PM2.5 ${sub.pm25?.toFixed(1) ?? '?'} µg/m³ · Pollen: ${sub.pollenLevel ?? 'Unknown'} (${source})`;
  return `Pollen: ${sub?.pollenLevel ?? 'Unknown'} · AQI data unavailable`;
}

function infSummary(sub, cdc) {
  if (!cdc) return 'CDC data not available for this location (US only).';
  const parts = [];
  if (sub?.fluILI != null) parts.push(`ILI ${sub.fluILI.toFixed(1)}%`);
  if (sub?.vaxRate != null) parts.push(`Vax ${sub.vaxRate.toFixed(0)}%`);
  if (sub?.covidHosp != null) parts.push(`COVID hosp ${sub.covidHosp.toFixed(1)}/100k`);
  return parts.length ? parts.join(' · ') + ' (state-level)' : 'Limited CDC data available.';
}

function hcSummary(sub, overpass) {
  if (!overpass || sub?.hospitalCount == null) return 'Healthcare facility data unavailable.';
  const spec = sub.hasSpecialist ? 'Specialist nearby ✓' : 'No specialist found';
  return `${sub.hospitalCount} hospital${sub.hospitalCount !== 1 ? 's' : ''} · ${sub.pharmacyCount} pharmac${sub.pharmacyCount !== 1 ? 'ies' : 'y'} · ${spec}`;
}

function clSummary(sub, weather) {
  if (!weather) return 'Climate data unavailable.';
  return `Humidity ${sub?.humidity?.toFixed(0) ?? '?'}% · Temp range ±${sub?.tempRange?.toFixed(1) ?? '?'}°C · Pollen: ${sub?.pollenLevel ?? 'Unknown'}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
