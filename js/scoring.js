/* All scores: 0–100, 100 = safest */

export function scoreAirQuality(airNow, openMeteo) {
  const aqi = airNow?.aqi ?? openMeteo?.aqi ?? null;
  const pm25 = airNow?.pm25 ?? openMeteo?.pm25 ?? null;
  const pollenLevel = openMeteo?.pollenLevel ?? 'None';

  const aqiScore = aqi != null ? inverseAQI(aqi) : null;
  const pm25Score = pm25 != null ? inversePM25(pm25) : null;
  const pollenScore = pollenLevelScore(pollenLevel);

  // Weight what we have
  if (aqiScore == null && pm25Score == null) return { score: 50, sub: { aqiScore: null, pm25Score: null, pollenScore }, confidence: 'low' };

  const weights = { aqi: 0.5, pm25: 0.3, pollen: 0.2 };
  let score = 0, total = 0;
  if (aqiScore != null) { score += aqiScore * weights.aqi; total += weights.aqi; }
  if (pm25Score != null) { score += pm25Score * weights.pm25; total += weights.pm25; }
  score += pollenScore * weights.pollen; total += weights.pollen;
  score = Math.round(score / total * (weights.aqi + weights.pm25 + weights.pollen));

  return {
    score: clamp(Math.round(score)),
    sub: { aqiScore, pm25Score, pollenScore, aqi, pm25, pollenLevel },
    confidence: airNow ? 'high' : 'medium',
  };
}

export function scoreInfection(cdc) {
  if (!cdc) return { score: 50, sub: {}, confidence: 'low' };

  const { fluILI, vaxRate, covidHosp } = cdc;
  const fluScore = fluILI != null ? inverseILI(fluILI) : null;
  const vaxScore = vaxRate != null ? vaxRateScore(vaxRate) : null;
  const covidScore = covidHosp != null ? inverseCovidHosp(covidHosp) : null;

  let score = 0, total = 0;
  const w = { flu: 0.35, vax: 0.35, covid: 0.30 };
  if (fluScore != null) { score += fluScore * w.flu; total += w.flu; }
  if (vaxScore != null) { score += vaxScore * w.vax; total += w.vax; }
  if (covidScore != null) { score += covidScore * w.covid; total += w.covid; }

  if (total === 0) return { score: 50, sub: { fluScore, vaxScore, covidScore }, confidence: 'low' };

  return {
    score: clamp(Math.round(score / total)),
    sub: { fluScore, vaxScore, covidScore, fluILI, vaxRate, covidHosp },
    confidence: total > 0.5 ? 'medium' : 'low',
  };
}

export function scoreHealthcare(overpass) {
  if (!overpass || overpass.hospitalCount == null) return { score: 50, sub: {}, confidence: 'low' };

  const { hospitalCount, pharmacyCount, hasSpecialist } = overpass;
  const hospScore = hospitalCountScore(hospitalCount);
  const pharmScore = pharmacyCountScore(pharmacyCount ?? 0);
  const specScore = hasSpecialist ? 100 : 20;

  const score = Math.round(hospScore * 0.40 + pharmScore * 0.25 + specScore * 0.35);
  return {
    score: clamp(score),
    sub: { hospScore, pharmScore, specScore, hospitalCount, pharmacyCount, hasSpecialist },
    confidence: 'medium',
  };
}

export function scoreClimate(weather, openMeteo) {
  const humidity = weather?.avgHumidity ?? null;
  const tempRange = weather?.avgTempRange ?? null;
  const pollenLevel = openMeteo?.pollenLevel ?? 'None';

  const humScore = humidity != null ? humidityScore(humidity) : null;
  const tempScore = tempRange != null ? tempRangeScore(tempRange) : null;
  const pollenScore = pollenLevelScore(pollenLevel);

  let score = 0, total = 0;
  const w = { hum: 0.50, temp: 0.30, pollen: 0.20 };
  if (humScore != null) { score += humScore * w.hum; total += w.hum; }
  if (tempScore != null) { score += tempScore * w.temp; total += w.temp; }
  score += pollenScore * w.pollen; total += w.pollen;

  if (total === 0) return { score: 50, sub: {}, confidence: 'low' };

  return {
    score: clamp(Math.round(score / total)),
    sub: { humScore, tempScore, pollenScore, humidity, tempRange, pollenLevel },
    confidence: weather ? 'medium' : 'low',
  };
}

export function scoreOverall(scores, weights) {
  const { air, infection, healthcare, climate } = scores;
  const w = normalizeWeights(weights);
  const overall = Math.round(
    air * w.air +
    infection * w.infection +
    healthcare * w.healthcare +
    climate * w.climate
  );
  return clamp(overall);
}

export function scoreLabel(score) {
  if (score >= 80) return { label: 'Low Risk', cls: 'low', badgeCls: 'badge-low', gaugeCls: 'gauge-low' };
  if (score >= 60) return { label: 'Moderate Risk', cls: 'mod', badgeCls: 'badge-mod', gaugeCls: 'gauge-mod' };
  if (score >= 40) return { label: 'Elevated Risk', cls: 'elev', badgeCls: 'badge-elev', gaugeCls: 'gauge-elev' };
  if (score >= 20) return { label: 'High Risk', cls: 'high', badgeCls: 'badge-high', gaugeCls: 'gauge-high' };
  return { label: 'Severe Risk', cls: 'severe', badgeCls: 'badge-severe', gaugeCls: 'gauge-severe' };
}

export function scoreColor(score) {
  if (score >= 80) return '#4caf50';
  if (score >= 60) return '#8bc34a';
  if (score >= 40) return '#ff9800';
  if (score >= 20) return '#f44336';
  return '#b71c1c';
}

/* Monthly climate risk score for the seasonal calendar (0–100, 100 = lowest risk) */
export function monthlyRiskScore(monthData) {
  if (!monthData) return 50;
  const humScore = monthData.avgHumidity != null ? humidityScore(monthData.avgHumidity) : 50;
  const tempScore = monthData.avgTempRange != null ? tempRangeScore(monthData.avgTempRange) : 50;
  return Math.round(humScore * 0.6 + tempScore * 0.4);
}

export function normalizeWeights(w) {
  const total = w.air + w.infection + w.healthcare + w.climate;
  return {
    air: w.air / total,
    infection: w.infection / total,
    healthcare: w.healthcare / total,
    climate: w.climate / total,
  };
}

// ── Sub-scorers ──────────────────────────────────────

function inverseAQI(aqi) {
  if (aqi <= 50) return 100;
  if (aqi <= 100) return lerp(100, 75, (aqi - 50) / 50);
  if (aqi <= 150) return lerp(75, 50, (aqi - 100) / 50);
  if (aqi <= 200) return lerp(50, 25, (aqi - 150) / 50);
  if (aqi <= 300) return lerp(25, 0, (aqi - 200) / 100);
  return 0;
}

function inversePM25(pm25) {
  if (pm25 <= 12) return 100;
  if (pm25 <= 35) return lerp(100, 60, (pm25 - 12) / 23);
  if (pm25 <= 55) return lerp(60, 20, (pm25 - 35) / 20);
  return 0;
}

function pollenLevelScore(level) {
  const map = { 'None': 100, 'Low': 80, 'Moderate': 55, 'High': 25, 'Very High': 0 };
  return map[level] ?? 60;
}

function inverseILI(pct) {
  if (pct < 1) return 100;
  if (pct < 2) return lerp(100, 80, pct - 1);
  if (pct < 4) return lerp(80, 55, (pct - 2) / 2);
  if (pct < 6) return lerp(55, 30, (pct - 4) / 2);
  return Math.max(0, lerp(30, 0, (pct - 6) / 4));
}

function vaxRateScore(rate) {
  if (rate >= 70) return 100;
  if (rate >= 60) return lerp(100, 80, (70 - rate) / 10);
  if (rate >= 50) return lerp(80, 60, (60 - rate) / 10);
  if (rate >= 40) return lerp(60, 40, (50 - rate) / 10);
  return Math.max(20, lerp(40, 20, (40 - rate) / 10));
}

function inverseCovidHosp(rate) {
  if (rate < 1) return 100;
  if (rate < 5) return lerp(100, 70, (rate - 1) / 4);
  if (rate < 10) return lerp(70, 40, (rate - 5) / 5);
  return Math.max(10, lerp(40, 10, (rate - 10) / 10));
}

function hospitalCountScore(n) {
  if (n === 0) return 0;
  if (n === 1) return 50;
  if (n === 2) return 70;
  if (n < 5) return 90;
  return 100;
}

function pharmacyCountScore(n) {
  if (n === 0) return 0;
  if (n <= 2) return 60;
  if (n <= 5) return 80;
  return 100;
}

function humidityScore(rh) {
  if (rh >= 30 && rh <= 55) return 100;
  if (rh >= 20 && rh < 30) return lerp(70, 100, (rh - 20) / 10);
  if (rh > 55 && rh <= 65) return lerp(100, 70, (rh - 55) / 10);
  if (rh >= 10 && rh < 20) return lerp(45, 70, (rh - 10) / 10);
  if (rh > 65 && rh <= 75) return lerp(70, 45, (rh - 65) / 10);
  return 15;
}

function tempRangeScore(range) {
  if (range < 15) return 100;
  if (range < 25) return lerp(100, 70, (range - 15) / 10);
  if (range < 35) return lerp(70, 40, (range - 25) / 10);
  return Math.max(15, lerp(40, 15, (range - 35) / 10));
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp(n) { return Math.max(0, Math.min(100, n)); }
