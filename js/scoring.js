/* All scores: 0–100, 100 = safest */

export function scoreAirQuality(airNow, openMeteo, seasonal = null, geo = {}) {
  const aqi = airNow?.aqi ?? openMeteo?.aqi ?? null;
  const pm25 = openMeteo?.pm25 ?? null;
  const pollenLevel = openMeteo?.pollenLevel ?? null;
  const pollenSource = openMeteo?.pollenSource ?? openMeteo?.source ?? null;

  const aqiScore = aqi != null ? inverseAQI(aqi) : null;
  const pm25Score = pm25 != null ? inversePM25(pm25) : null;
  const pollenScore = pollenLevel != null ? pollenLevelScore(pollenLevel) : null;
  const smokeScore = wildfireSmokeScore(geo, seasonal);

  // Weight what we have
  if (aqiScore == null && pm25Score == null && pollenScore == null && smokeScore == null) {
    return {
      score: 50,
      sub: { aqiScore: null, pm25Score: null, pollenScore, aqi, pm25, pollenLevel, pollenSource },
      confidence: 'low',
    };
  }

  const weights = { aqi: 0.5, pm25: 0.3, pollen: 0.2 };
  if (smokeScore != null) {
    weights.aqi = 0.38;
    weights.pm25 = 0.28;
    weights.pollen = 0.18;
    weights.smoke = 0.16;
  }
  let score = 0, total = 0;
  if (aqiScore != null) { score += aqiScore * weights.aqi; total += weights.aqi; }
  if (pm25Score != null) { score += pm25Score * weights.pm25; total += weights.pm25; }
  if (pollenScore != null) { score += pollenScore * weights.pollen; total += weights.pollen; }
  if (smokeScore != null) { score += smokeScore * weights.smoke; total += weights.smoke; }
  score = Math.round(score / total);

  return {
    score: clamp(Math.round(score)),
    sub: { aqiScore, pm25Score, pollenScore, smokeScore, aqi, pm25, pollenLevel, pollenSource },
    confidence: airNow ? 'high' : openMeteo?.confidence ?? 'medium',
  };
}

export function scoreInfection(cdc, wastewater = null, localHealth = null) {
  if (!cdc && !wastewater && !localHealth) return { score: 50, sub: {}, confidence: 'low' };

  const { ariLevel, combinedHospRate, covidHospRate, fluHospRate, rsvHospRate, weekEnd } = cdc ?? {};
  const ariScore = ariLevelScore(ariLevel);
  const combinedHospScore = combinedHospRate != null ? inverseRespHosp(combinedHospRate) : null;
  const pathogenScores = [covidHospRate, fluHospRate, rsvHospRate]
    .filter(v => v != null)
    .map(inverseRespHosp);
  const pathogenHospScore = pathogenScores.length ? avg(pathogenScores) : null;
  const wastewaterScore = wastewater?.avgPercentile != null ? inversePercentile(wastewater.avgPercentile) : null;
  const communityHealthScore = localHealthScore(localHealth);

  let score = 0, total = 0;
  const w = { ari: 0.35, combined: 0.28, pathogens: 0.15, wastewater: 0.12, community: 0.10 };
  if (ariScore != null) { score += ariScore * w.ari; total += w.ari; }
  if (combinedHospScore != null) { score += combinedHospScore * w.combined; total += w.combined; }
  if (pathogenHospScore != null) { score += pathogenHospScore * w.pathogens; total += w.pathogens; }
  if (wastewaterScore != null) { score += wastewaterScore * w.wastewater; total += w.wastewater; }
  if (communityHealthScore != null) { score += communityHealthScore * w.community; total += w.community; }

  if (total === 0) return { score: 50, sub: { ariScore, combinedHospScore, pathogenHospScore, wastewaterScore, communityHealthScore }, confidence: 'low' };

  return {
    score: clamp(Math.round(score / total)),
    sub: {
      ariScore, combinedHospScore, pathogenHospScore, wastewaterScore, communityHealthScore,
      ariLevel, combinedHospRate, covidHospRate, fluHospRate, rsvHospRate, weekEnd,
      wastewaterPercentile: wastewater?.avgPercentile ?? null,
      wastewaterMaxPercentile: wastewater?.maxPercentile ?? null,
      wastewaterDate: wastewater?.latestDate ?? null,
      asthmaRate: localHealth?.measures?.CASTHMA?.value ?? null,
      copdRate: localHealth?.measures?.COPD?.value ?? null,
      smokingRate: localHealth?.measures?.CSMOKING?.value ?? null,
      uninsuredRate: localHealth?.measures?.ACCESS2?.value ?? null,
    },
    confidence: total >= 0.55 && cdc ? 'high' : total >= 0.25 ? 'medium' : 'low',
  };
}

export function scoreHealthcare(overpass, cmsQuality = null) {
  if (!overpass || (overpass.hospitalCount == null && overpass.nearestHospitalKm == null)) return { score: 50, sub: {}, confidence: 'low' };

  const {
    hospitalCount, pharmacyCount, specialistCount, hasSpecialist,
    nearestHospitalKm, estimatedHospitalDriveMinutes, nearestHospitalName, urgentCareCount,
  } = overpass;
  const hospScore = nearestHospitalKm != null
    ? hospitalDistanceScore(nearestHospitalKm)
    : hospitalCountScore(hospitalCount ?? 0);
  const driveScore = estimatedHospitalDriveMinutes != null ? driveTimeScore(estimatedHospitalDriveMinutes) : null;
  const pharmScore = pharmacyCountScore(pharmacyCount ?? 0);
  const specScore = specialistDepthScore(specialistCount, hasSpecialist);
  const urgentScore = urgentCareCount > 0 ? 100 : 50;
  const qualityScore = cmsQuality?.avgRating != null ? cmsRatingScore(cmsQuality.avgRating) : healthcareQualityProxy(overpass);

  const parts = [
    [hospScore, 0.30],
    [driveScore, 0.18],
    [pharmScore, 0.14],
    [specScore, 0.24],
    [urgentScore, 0.04],
    [qualityScore, 0.10],
  ].filter(([value]) => value != null);
  const score = weightedAverage(parts);
  return {
    score: clamp(score),
    sub: {
      hospScore, driveScore, pharmScore, specScore, urgentScore, qualityScore,
      hospitalCount, pharmacyCount, specialistCount, hasSpecialist,
      nearestHospitalKm, estimatedHospitalDriveMinutes, nearestHospitalName, urgentCareCount,
      cmsAvgRating: cmsQuality?.avgRating ?? null,
      cmsRatedCount: cmsQuality?.ratedCount ?? null,
      qualityProxyScore: cmsQuality?.avgRating == null ? qualityScore : null,
    },
    confidence: cmsQuality?.avgRating != null ? 'high' : overpass.confidence ?? 'medium',
  };
}

export function scoreClimate(weather, openMeteo, seasonal = null) {
  const humidity = weather?.avgHumidity ?? null;
  const tempRange = weather?.avgTempRange ?? null;
  const pollenLevel = openMeteo?.pollenLevel ?? null;
  const pollenSource = openMeteo?.pollenSource ?? openMeteo?.source ?? null;

  const humScore = humidity != null ? humidityScore(humidity) : null;
  const tempScore = tempRange != null ? tempRangeScore(tempRange) : null;
  const pollenScore = pollenLevel != null ? pollenLevelScore(pollenLevel) : null;
  const tailRiskScore = seasonalTailRiskScore(seasonal?.summary);

  let score = 0, total = 0;
  const w = { hum: 0.38, temp: 0.24, pollen: 0.16, tail: 0.22 };
  if (humScore != null) { score += humScore * w.hum; total += w.hum; }
  if (tempScore != null) { score += tempScore * w.temp; total += w.temp; }
  if (pollenScore != null) { score += pollenScore * w.pollen; total += w.pollen; }
  if (tailRiskScore != null) { score += tailRiskScore * w.tail; total += w.tail; }

  if (total === 0) return { score: 50, sub: {}, confidence: 'low' };

  return {
    score: clamp(Math.round(score / total)),
    sub: {
      humScore, tempScore, pollenScore, humidity, tempRange,
      maxTemp: weather?.maxTemp ?? null,
      minTemp: weather?.minTemp ?? null,
      pollenLevel, pollenSource, tailRiskScore,
      heatDays35C: seasonal?.summary?.heatDays35C ?? null,
      coldDaysMinus10C: seasonal?.summary?.coldDaysMinus10C ?? null,
      humidDays70: seasonal?.summary?.humidDays70 ?? null,
      dryDays25: seasonal?.summary?.dryDays25 ?? null,
      swingDays25C: seasonal?.summary?.swingDays25C ?? null,
    },
    confidence: seasonal?.summary ? 'medium' : weather?.avgHumidity != null || weather?.avgTempRange != null ? weather.confidence ?? 'medium' : 'low',
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

export function buildRiskAssessment({ scores, categoryResults, data = {}, geo = {}, weights, profile }) {
  const base = scoreOverall(scores, weights);
  const confidences = {
    air: categoryResults.air.confidence,
    infection: categoryResults.infection.confidence,
    healthcare: categoryResults.healthcare.confidence,
    climate: categoryResults.climate.confidence,
  };
  const normalized = normalizeWeights(weights);
  const confidenceScore = Object.entries(confidences).reduce((sum, [key, value]) => {
    return sum + confidenceValue(value) * normalized[key];
  }, 0);
  const redFlags = buildRedFlags({ categoryResults, data, geo, profile });
  const penalty = redFlags.reduce((sum, flag) => sum + flag.penalty, 0);
  const overall = clamp(Math.round(base - penalty));
  const uncertainty = Math.round((1 - confidenceScore) * 18 + redFlags.length * 1.5);

  return {
    base,
    overall,
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    range: [clamp(overall - uncertainty), clamp(overall + Math.max(4, Math.round(uncertainty * 0.7)))],
    redFlags,
    dataCompleteness: {
      used: Object.values(confidences).filter(value => value !== 'low').length,
      total: Object.keys(confidences).length,
    },
  };
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
  return map[level] ?? null;
}

function ariLevelScore(level) {
  const map = {
    'Very Low': 100,
    Low: 85,
    Moderate: 60,
    High: 30,
    'Very High': 10,
    'Data Unavailable': null,
  };
  return map[level] ?? null;
}

function inverseRespHosp(rate) {
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

function hospitalDistanceScore(km) {
  if (km <= 10) return 100;
  if (km <= 20) return lerp(100, 80, (km - 10) / 10);
  if (km <= 35) return lerp(80, 55, (km - 20) / 15);
  if (km <= 50) return lerp(55, 30, (km - 35) / 15);
  return 10;
}

function driveTimeScore(minutes) {
  if (minutes <= 12) return 100;
  if (minutes <= 25) return lerp(100, 78, (minutes - 12) / 13);
  if (minutes <= 45) return lerp(78, 45, (minutes - 25) / 20);
  if (minutes <= 75) return lerp(45, 15, (minutes - 45) / 30);
  return 5;
}

function pharmacyCountScore(n) {
  if (n === 0) return 0;
  if (n <= 2) return 60;
  if (n <= 5) return 80;
  return 100;
}

function specialistDepthScore(count, hasSpecialist) {
  if (count == null) return hasSpecialist ? 75 : 20;
  if (count <= 0) return 15;
  if (count === 1) return 58;
  if (count <= 3) return 78;
  return 100;
}

function cmsRatingScore(rating) {
  if (rating == null) return null;
  return clamp(Math.round((rating - 1) / 4 * 100));
}

function healthcareQualityProxy(data) {
  if (!data) return null;
  const hospitals = data.hospitalCount ?? 0;
  const specialists = data.specialistCount ?? (data.hasSpecialist ? 1 : 0);
  const academicNameBonus = (data.hospitals ?? []).some(hospital =>
    /university|children|national|jewish|mayo|cleveland|mass general|brigham|johns hopkins|md anderson/i.test(hospital.name ?? '')
  ) ? 12 : 0;
  const redundancy = hospitals >= 10 ? 35 : hospitals >= 5 ? 26 : hospitals >= 2 ? 16 : hospitals === 1 ? 8 : 0;
  const specialty = specialists >= 4 ? 35 : specialists >= 2 ? 26 : specialists === 1 ? 16 : 0;
  const pharmacy = (data.pharmacyCount ?? 0) >= 10 ? 18 : (data.pharmacyCount ?? 0) >= 4 ? 12 : (data.pharmacyCount ?? 0) >= 1 ? 6 : 0;
  return clamp(35 + redundancy + specialty + pharmacy + academicNameBonus);
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

function inversePercentile(percentile) {
  return clamp(Math.round(100 - percentile));
}

function wildfireSmokeScore(geo, seasonal) {
  const stateCode = geo?.stateCode?.toUpperCase();
  const smokeStates = {
    CA: 25, OR: 30, WA: 35, NV: 35, ID: 38, MT: 38, UT: 42, CO: 45, AZ: 48, NM: 48,
  };
  if (!smokeStates[stateCode]) return null;
  const dryDays = seasonal?.summary?.dryDays25 ?? 0;
  const heatDays = seasonal?.summary?.heatDays32C ?? 0;
  const climatePenalty = Math.min(20, dryDays * 0.15 + heatDays * 0.25);
  return clamp(Math.round(smokeStates[stateCode] - climatePenalty));
}

function localHealthScore(localHealth) {
  const m = localHealth?.measures;
  if (!m) return null;
  const values = [
    burdenScore(m.CASTHMA?.value, 7, 13),
    burdenScore(m.COPD?.value, 4, 10),
    burdenScore(m.CSMOKING?.value, 10, 22),
    burdenScore(m.ACCESS2?.value, 6, 18),
  ].filter(v => v != null);
  return values.length ? Math.round(avg(values)) : null;
}

function burdenScore(value, good, poor) {
  if (value == null) return null;
  if (value <= good) return 100;
  if (value >= poor) return 30;
  return Math.round(lerp(100, 30, (value - good) / (poor - good)));
}

function seasonalTailRiskScore(summary = null) {
  if (!summary) return null;
  const heatPenalty = Math.min(34, summary.heatDays35C * 1.3 + summary.heatDays32C * 0.35);
  const coldPenalty = Math.min(22, summary.coldDaysMinus10C * 0.7);
  const humidityPenalty = Math.min(24, summary.humidDays70 * 0.28);
  const drynessPenalty = Math.min(14, summary.dryDays25 * 0.16);
  const swingPenalty = Math.min(18, summary.swingDays25C * 0.5);
  return clamp(Math.round(100 - heatPenalty - coldPenalty - humidityPenalty - drynessPenalty - swingPenalty));
}

function buildRedFlags({ categoryResults, data, geo, profile }) {
  const sensitivity = profile?.redFlagSensitivity ?? 1;
  const flags = [];
  const add = (severity, title, text, penalty) => flags.push({
    severity,
    title,
    text,
    penalty: Math.round(penalty * sensitivity),
  });
  const air = categoryResults.air.sub;
  const infection = categoryResults.infection.sub;
  const healthcare = categoryResults.healthcare.sub;
  const climate = categoryResults.climate.sub;

  if (air.aqi >= 101) add('high', 'Current AQI is elevated', `AQI ${air.aqi} is unhealthy for sensitive groups.`, 7);
  if (air.pm25 >= 35) add('high', 'Fine-particle pollution is high', `PM2.5 is ${air.pm25.toFixed(1)} ug/m3.`, 6);
  if (['High', 'Very High'].includes(air.pollenLevel)) add('medium', 'Pollen is elevated', `${air.pollenLevel} pollen can worsen respiratory symptoms.`, 3);
  if (air.smokeScore != null && air.smokeScore < 50) add('medium', 'Wildfire-smoke tail risk', `${geo.stateCode || 'This region'} has meaningful seasonal smoke exposure risk.`, 5);

  if (['High', 'Very High'].includes(infection.ariLevel)) add('high', 'Respiratory illness activity is high', `CDC ARI level is ${infection.ariLevel}.`, 8);
  if (infection.combinedHospRate >= 5) add('high', 'Respiratory hospitalization burden', `${infection.combinedHospRate.toFixed(1)} hospitalizations per 100k per week.`, 7);
  if (infection.wastewaterPercentile >= 75) add('medium', 'Wastewater signal elevated', `Average wastewater percentile is ${infection.wastewaterPercentile.toFixed(0)}.`, 5);
  if (infection.asthmaRate >= 11 || infection.copdRate >= 8) add('medium', 'Local respiratory vulnerability', 'CDC PLACES indicates elevated chronic respiratory burden locally.', 3);

  if (healthcare.estimatedHospitalDriveMinutes >= 35) add('high', 'Long emergency travel time', `Estimated hospital drive time is ${healthcare.estimatedHospitalDriveMinutes} minutes.`, 8);
  if (healthcare.hospitalCount <= 1) add('medium', 'Limited hospital redundancy', 'Few hospital options were found in the wider search area.', 4);
  if (!healthcare.hasSpecialist) add('medium', 'No local immunology/allergy specialist', 'Specialty care may require travel or telehealth.', 5);
  if (healthcare.cmsAvgRating != null && healthcare.cmsAvgRating < 3) add('medium', 'Nearby hospital quality is below average', `Matched CMS average rating is ${healthcare.cmsAvgRating.toFixed(1)} stars.`, 4);

  if (climate.heatDays35C >= 10) add('high', 'Frequent extreme heat', `${climate.heatDays35C} days/year exceeded 35°C.`, 6);
  if (climate.coldDaysMinus10C >= 20) add('medium', 'Frequent extreme cold', `${climate.coldDaysMinus10C} days/year dropped below -10°C.`, 4);
  if (climate.humidDays70 >= 45) add('medium', 'High humidity/mold pressure', `${climate.humidDays70} high-humidity days/year suggest indoor mold-management burden.`, 4);

  Object.entries(categoryResults).forEach(([key, result]) => {
    if (result.confidence === 'low') add('low', `${labelForCategory(key)} data is weak`, 'This category contributes uncertainty to the score.', 2);
  });

  return flags.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function confidenceValue(value) {
  return { high: 1, medium: 0.65, low: 0.25 }[value] ?? 0.25;
}

function confidenceLabel(value) {
  if (value >= 0.82) return 'High';
  if (value >= 0.55) return 'Medium';
  return 'Low';
}

function labelForCategory(key) {
  return { air: 'Air quality', infection: 'Infection', healthcare: 'Healthcare', climate: 'Climate' }[key] ?? key;
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3 }[severity] ?? 0;
}

function weightedAverage(parts) {
  const total = parts.reduce((sum, [, weight]) => sum + weight, 0);
  return Math.round(parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / total);
}

function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
function clamp(n) { return Math.max(0, Math.min(100, n)); }
function avg(arr) { return arr.reduce((sum, v) => sum + v, 0) / arr.length; }
