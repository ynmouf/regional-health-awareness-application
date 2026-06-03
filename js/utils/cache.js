const PREFIX = 'hls_';

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { value, expires } = JSON.parse(raw);
    if (Date.now() > expires) { localStorage.removeItem(PREFIX + key); return null; }
    return value;
  } catch { return null; }
}

export function cacheSet(key, value, ttlMs = 10 * 60 * 1000) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, expires: Date.now() + ttlMs }));
  } catch { /* storage full — silently skip */ }
}

export function sessionGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function sessionSet(key, value) {
  try { sessionStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { }
}
