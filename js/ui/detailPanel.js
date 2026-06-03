import { scoreColor } from '../scoring.js';
import { getAirQualityContext, getInfectionRiskContext, getHealthcareContext, getClimateContext } from '../api/contextual.js';

const TOOLTIPS = {
  aqi: 'The Air Quality Index summarises how clean the air is. Values above 100 are considered unhealthy for sensitive groups including immunocompromised individuals.',
  pm25: 'Fine particles (PM2.5) smaller than 2.5 micrometres can penetrate deep into the lungs and bloodstream. Immunocompromised people have reduced ability to fight the resulting inflammation.',
  pollen: 'Airborne pollen can trigger allergic reactions. People on immunosuppressants are often more susceptible to allergen-driven respiratory inflammation.',
  ari: 'Acute respiratory illness activity reflects emergency department visits for respiratory diagnoses, including COVID-19, flu, RSV, and other respiratory infections.',
  respHosp: 'Weekly hospitalization rates show current severe respiratory disease burden per 100,000 people. Higher values are more concerning for immunocompromised people.',
  pathogenHosp: 'Pathogen-specific hospitalization rates separate COVID-19, flu, and RSV burden when CDC surveillance data is available.',
  hospitals: 'Proximity to hospitals matters when immune-related emergencies arise. Distance can be the difference between a manageable episode and a life-threatening delay.',
  pharmacies: 'Easy access to pharmacies ensures you can fill specialty medications without long travel, especially important during illness when driving is difficult.',
  specialist: 'Immunologists and allergists provide essential ongoing care. Lack of local specialists often means long waits and travel for routine monitoring.',
  humidity: 'Relative humidity between 30–55% minimises both mold growth risk and respiratory dryness. High humidity encourages mold spores; low humidity dries mucous membranes, reducing their protective function.',
  tempRange: 'Large daily temperature swings stress the body\'s thermoregulation. Immunocompromised individuals are less able to compensate for rapid environmental changes.',
};

const CATEGORIES = {
  air: {
    title: '🌬️ Air Quality & Pollution',
    source: 'AirNow (EPA) and Open-Meteo Air Quality API',
    sourceUrl: 'https://docs.airnowapi.org/',
    metrics: (sub) => [
      sub.aqi != null && {
        name: 'AQI (Air Quality Index)', value: sub.aqi,
        display: `${sub.aqi} — ${aqiCategory(sub.aqi)}`,
        score: sub.aqiScore, tooltip: TOOLTIPS.aqi,
      },
      sub.pm25 != null && {
        name: 'PM2.5 (Fine Particles)', value: sub.pm25,
        display: `${sub.pm25.toFixed(1)} µg/m³`,
        score: sub.pm25Score, tooltip: TOOLTIPS.pm25,
      },
      {
        name: 'Pollen Level', value: sub.pollenLevel ?? 'Unknown',
        display: sub.pollenLevel ?? 'Data unavailable',
        score: sub.pollenScore, tooltip: TOOLTIPS.pollen,
      },
    ].filter(Boolean),
  },
  infection: {
    title: '🦠 Infectious Disease Risk',
    source: 'CDC ARI Activity and RESP-NET (data.cdc.gov)',
    sourceUrl: 'https://data.cdc.gov/Public-Health-Surveillance/Level-of-Acute-Respiratory-Illness-ARI-Activity-by/f3zz-zga5',
    metrics: (sub) => [
      sub.ariLevel && {
        name: 'Acute Respiratory Illness Activity', value: sub.ariLevel,
        display: sub.ariLevel,
        score: sub.ariScore, tooltip: TOOLTIPS.ari,
      },
      sub.combinedHospRate != null && {
        name: 'Combined Respiratory Hospitalization Rate', value: sub.combinedHospRate,
        display: `${sub.combinedHospRate.toFixed(1)} per 100,000 per week`,
        score: sub.combinedHospScore, tooltip: TOOLTIPS.respHosp,
      },
      sub.covidHospRate != null && {
        name: 'COVID-19 Hospitalization Rate', value: sub.covidHospRate,
        display: `${sub.covidHospRate.toFixed(1)} per 100,000 per week`,
        score: sub.pathogenHospScore, tooltip: TOOLTIPS.pathogenHosp,
      },
      sub.fluHospRate != null && {
        name: 'Flu Hospitalization Rate', value: sub.fluHospRate,
        display: `${sub.fluHospRate.toFixed(1)} per 100,000 per week`,
        score: sub.pathogenHospScore, tooltip: TOOLTIPS.pathogenHosp,
      },
      sub.rsvHospRate != null && {
        name: 'RSV Hospitalization Rate', value: sub.rsvHospRate,
        display: `${sub.rsvHospRate.toFixed(1)} per 100,000 per week`,
        score: sub.pathogenHospScore, tooltip: TOOLTIPS.pathogenHosp,
      },
    ].filter(Boolean),
  },
  healthcare: {
    title: '🏥 Healthcare Access',
    source: 'OpenStreetMap (Overpass API)',
    sourceUrl: 'https://www.openstreetmap.org/',
    metrics: (sub) => [
      {
        name: 'Hospitals within 10 km', value: sub.hospitalCount ?? '?',
        display: `${sub.hospitalCount ?? 'Unknown'} hospital${sub.hospitalCount !== 1 ? 's' : ''}`,
        score: sub.hospScore, tooltip: TOOLTIPS.hospitals,
      },
      {
        name: 'Pharmacies within 5 km', value: sub.pharmacyCount ?? '?',
        display: `${sub.pharmacyCount ?? 'Unknown'} pharmac${sub.pharmacyCount !== 1 ? 'ies' : 'y'}`,
        score: sub.pharmScore, tooltip: TOOLTIPS.pharmacies,
      },
      {
        name: 'Immunology/Allergy Specialist within 20 km', value: sub.hasSpecialist,
        display: sub.hasSpecialist ? '✓ Specialist found' : '✗ None found',
        score: sub.specScore, tooltip: TOOLTIPS.specialist,
      },
    ],
  },
  climate: {
    title: '🌡️ Climate & Allergens',
    source: 'Open-Meteo Weather & Historical API',
    sourceUrl: 'https://open-meteo.com/',
    metrics: (sub) => [
      sub.humidity != null && {
        name: 'Average Relative Humidity', value: sub.humidity,
        display: `${sub.humidity.toFixed(0)}% RH`,
        score: sub.humScore, tooltip: TOOLTIPS.humidity,
      },
      sub.tempRange != null && {
        name: 'Daily Temperature Range', value: sub.tempRange,
        display: `±${sub.tempRange.toFixed(1)}°C average swing`,
        score: sub.tempScore, tooltip: TOOLTIPS.tempRange,
      },
      {
        name: 'Pollen Level', value: sub.pollenLevel ?? 'Unknown',
        display: sub.pollenLevel ?? 'Data unavailable',
        score: sub.pollenScore, tooltip: TOOLTIPS.pollen,
      },
    ].filter(Boolean),
  },
};

export function initDetailPanel() {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('panel-overlay');
  const closeBtn = document.getElementById('detail-close');

  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  document.querySelectorAll('.card-details-btn').forEach(btn => {
    btn.addEventListener('click', () => openPanel(btn.dataset.target));
  });
}

let currentData = {};
let currentGeo = {};
let currentMonthlyData = {};

export function setDetailData(data, geo, monthlyData) {
  currentData = data;
  currentGeo = geo || {};
  currentMonthlyData = monthlyData || [];
}

function openPanel(category) {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('panel-overlay');
  const def = CATEGORIES[category];
  if (!def) return;

  const data = currentData[category] ?? {};
  document.getElementById('detail-title').textContent = def.title;
  document.getElementById('detail-body').innerHTML = buildBody(def, data);

  panel.hidden = false;
  overlay.hidden = false;
  document.getElementById('detail-close').focus();

  document.querySelectorAll('.card-details-btn').forEach(b => {
    b.setAttribute('aria-expanded', b.dataset.target === category ? 'true' : 'false');
  });
}

function closePanel() {
  document.getElementById('detail-panel').hidden = true;
  document.getElementById('panel-overlay').hidden = true;
  document.querySelectorAll('.card-details-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function buildBody(def, data) {
  const metrics = def.metrics(data.sub ?? {});
  const metricHtml = metrics.map(m => `
    <div class="detail-metric">
      <div class="detail-metric-header">
        <span class="detail-metric-name">${m.name}</span>
        <span class="detail-metric-value" style="color:${scoreColor(m.score ?? 50)}">${m.display}</span>
      </div>
      <div class="detail-metric-bar-wrap">
        <div class="detail-metric-bar" style="width:${m.score ?? 50}%;background:${scoreColor(m.score ?? 50)}"></div>
      </div>
      <p class="detail-metric-desc">${m.tooltip}</p>
    </div>
  `).join('');

  // Get contextual insights
  let contextHtml = '';
  if (def.title.includes('Air Quality')) {
    const insights = getAirQualityContext(currentData.air, currentGeo);
    contextHtml = buildContextSection(insights);
  } else if (def.title.includes('Infection')) {
    const insights = getInfectionRiskContext(currentData.infection, currentGeo);
    contextHtml = buildContextSection(insights);
  } else if (def.title.includes('Healthcare')) {
    const insights = getHealthcareContext(currentData.healthcare, currentGeo);
    contextHtml = buildContextSection(insights);
  } else if (def.title.includes('Climate')) {
    const insights = getClimateContext(currentData.climate, currentMonthlyData, currentGeo);
    contextHtml = buildContextSection(insights);
  }

  const noteHtml = data.note ? `<p class="detail-source">⚠️ ${data.note}</p>` : '';
  const sourceHtml = `<p class="detail-source">Source: <a href="${def.sourceUrl}" target="_blank" rel="noopener">${escHtml(data.source || def.source)}</a> · Retrieved ${formatTime(data.timestamp)}</p>`;

  return metricHtml + contextHtml + noteHtml + sourceHtml;
}

function buildContextSection(insights) {
  if (!insights || !insights.length) return '';
  const html = insights.map(i => `
    <div class="detail-context-card">
      <div class="context-header">${i.icon} ${escHtml(i.title)}</div>
      <p class="context-text">${escHtml(i.text)}</p>
    </div>
  `).join('');
  return `<div class="detail-context">${html}</div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function aqiCategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function formatTime(iso) {
  if (!iso) return 'unknown time';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
