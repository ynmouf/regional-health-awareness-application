import { scoreColor } from '../scoring.js';
import { getAirQualityContext, getInfectionRiskContext, getHealthcareContext, getClimateContext } from '../api/contextual.js';

const TOOLTIPS = {
  aqi: 'The Air Quality Index summarises how clean the air is. Values above 100 are considered unhealthy for sensitive groups including immunocompromised individuals.',
  pm25: 'Fine particles (PM2.5) smaller than 2.5 micrometres can penetrate deep into the lungs and bloodstream. Immunocompromised people have reduced ability to fight the resulting inflammation.',
  pollen: 'Airborne pollen can trigger allergic reactions. People on immunosuppressants are often more susceptible to allergen-driven respiratory inflammation.',
  ari: 'Acute respiratory illness activity reflects emergency department visits for respiratory diagnoses, including COVID-19, flu, RSV, and other respiratory infections.',
  respHosp: 'Weekly hospitalization rates show current severe respiratory disease burden per 100,000 people. Higher values are more concerning for immunocompromised people.',
  pathogenHosp: 'Pathogen-specific hospitalization rates separate COVID-19, flu, and RSV burden when CDC surveillance data is available.',
  hospitals: 'Proximity to hospitals matters when immune-related emergencies arise. Nearby hospitals in adjacent towns, counties, or regions count because travel distance matters more than boundaries.',
  urgentCare: 'Urgent care and emergency clinics can help with less severe episodes, but they do not replace a full hospital for immune-related emergencies.',
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
      sub.pollenLevel != null && {
        name: 'Pollen Level', value: sub.pollenLevel ?? 'Unknown',
        display: sub.pollenLevel ?? 'Data unavailable',
        score: sub.pollenScore, tooltip: TOOLTIPS.pollen,
      },
      sub.smokeScore != null && {
        name: 'Wildfire Smoke Tail Risk', value: sub.smokeScore,
        display: `${sub.smokeScore}/100`,
        score: sub.smokeScore, tooltip: 'Regional wildfire-smoke risk is estimated from known smoke-prone states and historical heat/dryness pressure.',
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
      sub.wastewaterPercentile != null && {
        name: 'Wastewater Viral Activity Percentile', value: sub.wastewaterPercentile,
        display: `${sub.wastewaterPercentile.toFixed(0)}th percentile${sub.wastewaterDate ? ` — ${sub.wastewaterDate}` : ''}`,
        score: sub.wastewaterScore, tooltip: 'CDC wastewater percentiles provide community-level respiratory-virus context where reporting sites are available.',
      },
      sub.communityHealthScore != null && {
        name: 'Local Respiratory Health Context', value: sub.communityHealthScore,
        display: `${sub.communityHealthScore}/100`,
        score: sub.communityHealthScore, tooltip: 'CDC PLACES county estimates for asthma, COPD, smoking, and insurance coverage provide local vulnerability context.',
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
      sub.nearestHospitalKm != null && {
        name: 'Nearest Hospital', value: sub.nearestHospitalKm,
        display: `${sub.nearestHospitalKm.toFixed(1)} km${sub.nearestHospitalName ? ` — ${sub.nearestHospitalName}` : ''}`,
        score: sub.hospScore, tooltip: TOOLTIPS.hospitals,
      },
      sub.estimatedHospitalDriveMinutes != null && {
        name: 'Estimated Hospital Drive Time', value: sub.estimatedHospitalDriveMinutes,
        display: `${sub.estimatedHospitalDriveMinutes} minutes`,
        score: sub.driveScore, tooltip: TOOLTIPS.hospitals,
      },
      sub.hospitalCount != null && {
        name: 'Hospitals within 50 km', value: sub.hospitalCount ?? '?',
        display: `${sub.hospitalCount ?? 'Unknown'} hospital${sub.hospitalCount !== 1 ? 's' : ''}`,
        score: sub.hospScore, tooltip: TOOLTIPS.hospitals,
      },
      sub.pharmacyCount != null && {
        name: 'Pharmacies within 5 km', value: sub.pharmacyCount ?? '?',
        display: `${sub.pharmacyCount ?? 'Unknown'} pharmac${sub.pharmacyCount !== 1 ? 'ies' : 'y'}`,
        score: sub.pharmScore, tooltip: TOOLTIPS.pharmacies,
      },
      sub.hasSpecialist != null && {
        name: 'Immunology/Allergy Specialist within 20 km', value: sub.hasSpecialist,
        display: sub.hasSpecialist ? `${sub.specialistCount ?? 1} specialist${sub.specialistCount === 1 ? '' : 's'} found` : 'None found',
        score: sub.specScore, tooltip: TOOLTIPS.specialist,
      },
      sub.cmsAvgRating != null && {
        name: 'Matched CMS Hospital Quality', value: sub.cmsAvgRating,
        display: `${sub.cmsAvgRating.toFixed(1)} stars (${sub.cmsRatedCount} rated)`,
        score: sub.qualityScore, tooltip: 'CMS Overall Hospital Quality Star Ratings summarize public hospital-quality measures where matched facilities are available.',
      },
      sub.qualityProxyScore != null && {
        name: 'Healthcare Quality Proxy', value: sub.qualityProxyScore,
        display: `${sub.qualityProxyScore}/100`,
        score: sub.qualityProxyScore, tooltip: 'When CMS ratings are unavailable in-browser, this proxy uses hospital redundancy, specialist depth, pharmacy access, and major-center name signals.',
      },
      sub.urgentCareCount != null && {
        name: 'Urgent/Emergency Clinics', value: sub.urgentCareCount,
        display: `${sub.urgentCareCount} support facilit${sub.urgentCareCount !== 1 ? 'ies' : 'y'} found`,
        score: sub.urgentScore, tooltip: TOOLTIPS.urgentCare,
      },
    ].filter(Boolean),
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
      sub.pollenLevel != null && {
        name: 'Pollen Level', value: sub.pollenLevel ?? 'Unknown',
        display: sub.pollenLevel ?? 'Data unavailable',
        score: sub.pollenScore, tooltip: TOOLTIPS.pollen,
      },
      sub.tailRiskScore != null && {
        name: 'Historical Climate Tail Risk', value: sub.tailRiskScore,
        display: `${sub.tailRiskScore}/100`,
        score: sub.tailRiskScore, tooltip: 'Historical extreme heat, cold, humidity, dryness, and daily temperature swings lower this score.',
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
  const metricHtml = metrics.length ? metrics.map(m => `
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
  `).join('') : '<p class="detail-source">No live measurements are available for this category right now.</p>';

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
  const confidenceHtml = ` · Data confidence: ${escHtml(formatConfidence(data.confidence))}`;
  const source = data.source || def.source;
  const sourceHtml = `<p class="detail-source">Source: <a href="${sourceUrlFor(source, def.sourceUrl)}" target="_blank" rel="noopener">${escHtml(source)}</a> · Retrieved ${formatTime(data.timestamp)}${confidenceHtml}</p>`;

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

function formatConfidence(confidence) {
  if (!confidence) return 'Unknown';
  const value = String(confidence).trim().toLowerCase();
  return value ? value[0].toUpperCase() + value.slice(1) : 'Unknown';
}

function sourceUrlFor(source, fallback) {
  const value = String(source || '');
  if (value.includes('Google Places')) return 'https://developers.google.com/maps/documentation/places/web-service';
  if (value.includes('Google Pollen')) return 'https://developers.google.com/maps/documentation/pollen';
  if (value.includes('Open-Meteo')) return 'https://open-meteo.com/';
  if (value.includes('CDC')) return 'https://data.cdc.gov/';
  if (value.includes('CMS')) return 'https://data.cms.gov/provider-data/topics/hospitals';
  if (value.includes('AirNow')) return 'https://docs.airnowapi.org/';
  if (value.includes('OpenStreetMap') || value.includes('Overpass')) return 'https://www.openstreetmap.org/';
  return fallback;
}
