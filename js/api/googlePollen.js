import { cacheGet, cacheSet } from '../utils/cache.js';

const BASE = 'https://pollen.googleapis.com/v1/forecast:lookup';

export async function fetchGooglePollen(lat, lon, apiKey) {
  if (!apiKey) return null;

  const key = `g_pollen_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      key: apiKey,
      'location.latitude': String(lat),
      'location.longitude': String(lon),
      days: '1',
    });
    const res = await fetch(`${BASE}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const day = data.dailyInfo?.[0];
    if (!day) return null;

    const pollenTypes = day.pollenTypeInfo ?? [];
    const plants = day.plantInfo ?? [];
    const indexed = [...pollenTypes, ...plants]
      .map(item => ({
        code: item.code ?? item.displayName ?? '',
        value: item.indexInfo?.value ?? null,
        category: item.indexInfo?.category ?? null,
      }))
      .filter(item => item.value != null || item.category);

    if (!indexed.length) return null;

    const max = indexed.reduce((best, item) => {
      const itemValue = item.value ?? categoryValue(item.category);
      const bestValue = best.value ?? categoryValue(best.category);
      return itemValue > bestValue ? item : best;
    }, indexed[0]);

    const result = {
      pollenRaw: max.value ?? categoryValue(max.category),
      pollenLevel: normalizeCategory(max.category) ?? valueLabel(max.value),
      grassPollen: findValue(indexed, /grass/i),
      ragweedPollen: findValue(indexed, /ragweed/i),
      treePollen: findValue(indexed, /tree|oak|birch|cedar|elm|maple/i),
      source: 'Google Pollen API',
      confidence: 'high',
      timestamp: new Date().toISOString(),
    };
    cacheSet(key, result, 6 * 60 * 60 * 1000);
    return result;
  } catch {
    return null;
  }
}

export function mergePollen(openMeteoAQ, googlePollen) {
  if (!googlePollen) return openMeteoAQ;
  return {
    ...(openMeteoAQ ?? {}),
    pollenRaw: googlePollen.pollenRaw,
    pollenLevel: googlePollen.pollenLevel,
    grassPollen: googlePollen.grassPollen ?? openMeteoAQ?.grassPollen ?? null,
    ragweedPollen: googlePollen.ragweedPollen ?? openMeteoAQ?.ragweedPollen ?? null,
    treePollen: googlePollen.treePollen ?? openMeteoAQ?.treePollen ?? null,
    pollenSource: googlePollen.source,
    pollenTimestamp: googlePollen.timestamp,
    confidence: openMeteoAQ?.confidence ?? googlePollen.confidence,
  };
}

function findValue(items, pattern) {
  const found = items.find(item => pattern.test(String(item.code)));
  return found?.value ?? (found?.category ? categoryValue(found.category) : null);
}

function normalizeCategory(category) {
  if (!category) return null;
  const c = category.toLowerCase();
  if (c.includes('very high')) return 'Very High';
  if (c.includes('high')) return 'High';
  if (c.includes('moderate') || c.includes('medium')) return 'Moderate';
  if (c.includes('low')) return 'Low';
  if (c.includes('none')) return 'None';
  return null;
}

function categoryValue(category) {
  const level = normalizeCategory(category);
  return { None: 0, Low: 1, Moderate: 3, High: 4, 'Very High': 5 }[level] ?? 0;
}

function valueLabel(value) {
  if (value == null || value <= 0) return 'None';
  if (value <= 1) return 'Low';
  if (value <= 3) return 'Moderate';
  if (value <= 4) return 'High';
  return 'Very High';
}
