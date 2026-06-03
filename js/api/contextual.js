/* Generates region-specific context for each score category */

export function getAirQualityContext(airResult, geo) {
  const { aqi, pollenLevel } = airResult?.sub || {};
  const insights = [];

  // Known wildfire-prone regions
  const wildfireProne = ['CA', 'OR', 'WA', 'NV', 'UT', 'CO'];
  const stateCode = geo.stateCode?.toUpperCase();
  if (wildfireProne.includes(stateCode)) {
    insights.push({
      icon: '🔥',
      title: 'Wildfire Season',
      text: `${stateCode} experiences peak wildfire season June–October, with smoke drifting across large areas. Monitor AirNow during summer months.`
    });
  }

  // High pollen regions
  const ragweedStates = ['TX', 'OK', 'KS', 'NE', 'IA', 'MO', 'IL', 'IN'];
  if (ragweedStates.includes(stateCode)) {
    insights.push({
      icon: '🌾',
      title: 'High Ragweed Pollen',
      text: `Ragweed pollen is heavy in late summer/fall (Aug–Oct). People with allergies and asthma should plan accordingly.`
    });
  }

  // Coastal/ocean breeze effect
  if (geo.displayName?.includes('CA') && (geo.lon < -118)) {
    insights.push({
      icon: '🌊',
      title: 'Ocean Air Effects',
      text: `Coastal areas benefit from ocean breezes that clear inland smog, but marine layer traps pollution in some valleys.`
    });
  }

  return insights;
}

export function getInfectionRiskContext(infResult, geo) {
  const insights = [];

  const { ariLevel, combinedHospRate } = infResult?.sub || {};
  if (ariLevel && !['Very Low', 'Low', 'Data Unavailable'].includes(ariLevel)) {
    insights.push({
      icon: '⚠️',
      title: 'Elevated Respiratory Activity',
      text: `CDC reports ${ariLevel.toLowerCase()} acute respiratory illness activity in this state. Consider masking in crowded indoor spaces and avoiding high-risk events.`
    });
  }

  if (combinedHospRate != null && combinedHospRate >= 5) {
    insights.push({
      icon: '🏥',
      title: 'Hospitalization Burden',
      text: `Combined respiratory hospitalizations are ${combinedHospRate.toFixed(1)} per 100,000 this week, indicating meaningful severe disease burden.`
    });
  }

  // Seasonal flu pattern guidance
  insights.push({
    icon: '🌡️',
    title: 'Flu Season Timeline',
    text: `Northern US: Oct–Feb. Southern US: Dec–Mar. Track CDC respiratory illness activity for current state-level trends.`
  });

  return insights;
}

export function getHealthcareContext(hcResult, geo) {
  const { hospitalCount, hasSpecialist, nearestHospitalKm, nearestHospitalName, nearestSpecialistKm, specialistSearchRadiusKm } = hcResult?.sub || {};
  const insights = [];
  const specialistRadius = specialistSearchRadiusKm ?? 50;

  if (hasSpecialist === false) {
    insights.push({
      icon: '⚠️',
      title: 'No Regional Immunology Specialist Found',
      text: `No allergy or immunology specialist was found within ${specialistRadius} km. Consider telehealth options or plan periodic trips to a major medical center.`
    });
  } else if (hasSpecialist === true) {
    insights.push({
      icon: '✓',
      title: 'Immunology Specialist Found',
      text: `The nearest allergy or immunology specialist found is ${nearestSpecialistKm != null ? `${nearestSpecialistKm.toFixed(1)} km away` : `within ${specialistRadius} km`}.`
    });
  }

  if (nearestHospitalKm != null && nearestHospitalKm <= 20) {
    insights.push({
      icon: '🏥',
      title: 'Adjacent-Area Hospital Access',
      text: `${nearestHospitalName || 'The nearest hospital'} is ${nearestHospitalKm.toFixed(1)} km away. Nearby hospitals count even when they are outside the searched city or ZIP code.`
    });
  } else if (nearestHospitalKm != null) {
    insights.push({
      icon: '🚑',
      title: 'Longer Hospital Travel',
      text: `The nearest hospital found is ${nearestHospitalKm.toFixed(1)} km away. Plan for longer emergency travel and keep medical records accessible.`
    });
  } else if (hospitalCount >= 5) {
    insights.push({
      icon: '🏥',
      title: 'Multiple Hospital Options',
      text: `${hospitalCount} hospitals within the wider search area gives you choice and backup options in case your preferred hospital is at capacity.`
    });
  } else if (hospitalCount === 0) {
    insights.push({
      icon: '🚑',
      title: 'Rural Healthcare Access',
      text: `No hospitals nearby — plan for longer response times. Keep a recent medical history and list of specialists available.`
    });
  }

  return insights;
}

export function getClimateContext(climateResult, monthlyData, geo) {
  const insights = [];
  const months = Array.isArray(monthlyData) ? monthlyData : monthlyData?.months;
  const summary = monthlyData?.summary;

  // Find best and worst months
  if (months && months.length === 12) {
    const scored = months.map((m, i) => ({
      month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
      score: scoreMonth(m),
      data: m
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const worst = scored[scored.length - 1];

    insights.push({
      icon: '📅',
      title: 'Best Months',
      text: `${best.month} is typically safest for your health (stable temps, lower allergen levels). Plan major activities around this time.`
    });
    insights.push({
      icon: '⛈️',
      title: 'Challenging Months',
      text: `${worst.month} has higher pollen/extreme temps. Consider staying indoors more or planning trips elsewhere.`
    });
  }

  // Extreme weather warning
  const { maxTemp, minTemp } = climateResult?.sub || {};
  if (maxTemp > 35) {
    insights.push({
      icon: '🔥',
      title: 'Extreme Heat',
      text: `Temperatures exceed 35°C (95°F). Heat stress is dangerous for immunocompromised people; stay cool and hydrated.`
    });
  }
  if (minTemp < -10) {
    insights.push({
      icon: '❄️',
      title: 'Extreme Cold',
      text: `Temperatures drop below -10°C (14°F). Cold stress weakens immune function; limit outdoor exposure.`
    });
  }

  if (summary?.heatDays35C >= 10) {
    insights.push({
      icon: '🔥',
      title: 'Frequent Heat Extremes',
      text: `${summary.heatDays35C} days/year exceeded 35°C in recent historical data. Heat waves can make otherwise high-scoring locations unsafe.`
    });
  }
  if (summary?.humidDays70 >= 45) {
    insights.push({
      icon: '💧',
      title: 'Persistent Humidity',
      text: `${summary.humidDays70} high-humidity days/year suggest higher mold and indoor air-quality management needs.`
    });
  }

  return insights;
}

function scoreMonth(monthData) {
  if (!monthData) return 0;
  const humScore = monthData.avgHumidity ? (100 - Math.abs(monthData.avgHumidity - 42)) / 100 * 100 : 50;
  const tempScore = monthData.avgTempRange ? Math.max(0, 100 - monthData.avgTempRange * 3) : 50;
  return (humScore + tempScore) / 2;
}
