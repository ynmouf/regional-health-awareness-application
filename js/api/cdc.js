import { cacheGet, cacheSet } from '../utils/cache.js';

const SODA = 'https://data.cdc.gov/resource';
const ARI_DATASET = 'f3zz-zga5';
const RESP_NET_DATASET = 'kvib-3txy';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/* Fetches current ARI activity plus RESP-NET COVID/flu/RSV hospitalization rates for a US state */
export async function fetchCDCData(stateCode) {
  if (!stateCode) return null;
  const stateName = STATE_NAMES[stateCode.toUpperCase()];
  if (!stateName) return null;

  const cacheKey = `cdc_${stateCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const [ari, respNet] = await Promise.allSettled([
    fetchARIActivity(stateName),
    fetchRespNetRates(stateName),
  ]);

  const ariData = ari.status === 'fulfilled' ? ari.value : null;
  const respData = respNet.status === 'fulfilled' ? respNet.value : {};

  const result = {
    ariLevel: ariData?.level ?? null,
    combinedHospRate: respData.combinedHospRate ?? null,
    covidHospRate: respData.covidHospRate ?? null,
    fluHospRate: respData.fluHospRate ?? null,
    rsvHospRate: respData.rsvHospRate ?? null,
    weekEnd: ariData?.weekEnd ?? respData.weekEnd ?? null,
    stateCode,
    stateName,
    source: 'CDC (data.cdc.gov)',
    confidence: ariData || Object.keys(respData).length ? 'high' : 'low',
    note: 'Data reflects state-level respiratory surveillance, not your specific city.',
    timestamp: new Date().toISOString(),
  };

  cacheSet(cacheKey, result, 12 * 60 * 60 * 1000); // 12h — CDC updates weekly
  return result;
}

async function fetchARIActivity(stateName) {
  try {
    const params = new URLSearchParams({
      '$select': 'week_end,geography,label',
      '$where': `geography='${stateName.replace(/'/g, "''")}'`,
      '$order': 'week_end DESC',
      '$limit': '1',
    });
    const url = `${SODA}/${ARI_DATASET}.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return {
      level: data[0].label ?? null,
      weekEnd: data[0].week_end ?? null,
    };
  } catch { return null; }
}

async function fetchRespNetRates(stateName) {
  try {
    const params = new URLSearchParams({
      '$select': 'surveillance_network,week_ending_date,weekly_rate',
      '$where': [
        `site='${stateName.replace(/'/g, "''")}'`,
        "age_group='Overall'",
        "sex='Overall'",
        "race_ethnicity='Overall'",
        "rate_type='Observed'",
      ].join(' AND '),
      '$order': 'week_ending_date DESC',
      '$limit': '16',
    });
    const url = `${SODA}/${RESP_NET_DATASET}.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    if (!data.length) return {};

    const latestByNetwork = {};
    for (const row of data) {
      const network = row.surveillance_network;
      if (!network || latestByNetwork[network]) continue;
      latestByNetwork[network] = row;
    }

    return {
      combinedHospRate: rate(latestByNetwork.Combined),
      covidHospRate: rate(latestByNetwork['COVID-NET']),
      fluHospRate: rate(latestByNetwork['FluSurv-NET']),
      rsvHospRate: rate(latestByNetwork['RSV-NET']),
      weekEnd: data[0].week_ending_date ?? null,
    };
  } catch { return {}; }
}

function rate(row) {
  const n = parseFloat(row?.weekly_rate);
  return Number.isFinite(n) ? n : null;
}
