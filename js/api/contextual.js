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

  // Vaccination hotspot vs coldspot
  const { vaxRate } = infResult?.sub || {};
  if (vaxRate) {
    if (vaxRate >= 70) {
      insights.push({
        icon: '💉',
        title: 'High Community Immunity',
        text: `${vaxRate.toFixed(0)}% vaccination rate provides strong herd immunity. Outbreaks are rarer in this region.`
      });
    } else if (vaxRate < 50) {
      insights.push({
        icon: '⚠️',
        title: 'Lower Vaccination Coverage',
        text: `${vaxRate.toFixed(0)}% vaccination rate is below CDC targets. Disease spread risk is elevated during outbreaks.`
      });
    }
  }

  // Seasonal flu pattern guidance
  insights.push({
    icon: '🌡️',
    title: 'Flu Season Timeline',
    text: `Northern US: Oct–Feb. Southern US: Dec–Mar. Track CDC FluView for real-time ILI activity in your region.`
  });

  return insights;
}

export function getHealthcareContext(hcResult, geo) {
  const { hospitalCount, hasSpecialist } = hcResult?.sub || {};
  const insights = [];

  if (!hasSpecialist) {
    insights.push({
      icon: '⚠️',
      title: 'No Local Immunology Specialist',
      text: `You'll need to travel for specialized immunology care. Consider telehealth options or plan quarterly trips to a major medical center.`
    });
  } else {
    insights.push({
      icon: '✓',
      title: 'Immunology Specialist Nearby',
      text: `Having an immunologist within 20 km is ideal for ongoing immune monitoring and medication adjustments.`
    });
  }

  if (hospitalCount >= 5) {
    insights.push({
      icon: '🏥',
      title: 'Multiple Hospital Options',
      text: `${hospitalCount} hospitals within 10 km gives you choice and backup options in case your preferred hospital is at capacity.`
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

  // Find best and worst months
  if (monthlyData && monthlyData.length === 12) {
    const scored = monthlyData.map((m, i) => ({
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

  return insights;
}

function scoreMonth(monthData) {
  if (!monthData) return 0;
  const humScore = monthData.avgHumidity ? (100 - Math.abs(monthData.avgHumidity - 42)) / 100 * 100 : 50;
  const tempScore = monthData.avgTempRange ? Math.max(0, 100 - monthData.avgTempRange * 3) : 50;
  return (humScore + tempScore) / 2;
}
