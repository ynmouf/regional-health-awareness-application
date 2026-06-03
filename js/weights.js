import { PROFILES, getProfile } from './profiles.js';

const STORAGE_KEY = 'hls_weights';
const ALERT_KEY = 'hls_alert_threshold';
const PROFILE_KEY = 'hls_condition_profile';

const DEFAULTS = { air: 25, water: 30, healthcare: 30, climate: 15 };

export function getWeights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const w = JSON.parse(raw);
    // Validate all keys present and numeric
    if (['air','water','healthcare','climate'].every(k => typeof w[k] === 'number')) return w;
  } catch { }
  return { ...DEFAULTS };
}

export function getActiveProfileId() {
  try {
    const id = localStorage.getItem(PROFILE_KEY);
    return PROFILES[id] ? id : 'general';
  } catch {
    return 'general';
  }
}

export function getActiveProfile() {
  return getProfile(getActiveProfileId());
}

export function saveActiveProfile(profileId) {
  try { localStorage.setItem(PROFILE_KEY, profileId); } catch { }
}

export function saveWeights(w) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); } catch { }
}

export function resetWeights() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { }
  return { ...DEFAULTS };
}

export function getAlertThreshold() {
  try {
    const v = localStorage.getItem(ALERT_KEY);
    return v != null ? parseInt(v, 10) : null;
  } catch { return null; }
}

export function saveAlertThreshold(val) {
  try {
    if (val == null || isNaN(val)) localStorage.removeItem(ALERT_KEY);
    else localStorage.setItem(ALERT_KEY, String(val));
  } catch { }
}

/* Initialises sliders in settings panel and wires up live recalculation */
export function initWeightSliders(weights, onChangeCallback) {
  const factors = ['air', 'water', 'healthcare', 'climate'];
  const profileSelect = document.getElementById('condition-profile');
  const profileDescription = document.getElementById('profile-description');

  function syncProfileDescription() {
    const profile = getProfile(profileSelect?.value);
    if (profileDescription) profileDescription.textContent = profile.description;
  }

  factors.forEach(f => {
    const slider = document.getElementById(`w-${f}`);
    const pct = document.getElementById(`pct-${f}`);
    slider.value = weights[f];
    pct.textContent = weights[f] + '%';

    slider.addEventListener('input', () => {
      weights[f] = parseInt(slider.value, 10);
      pct.textContent = weights[f] + '%';
      saveWeights({ ...weights });
      onChangeCallback({ ...weights });
    });
  });

  if (profileSelect) {
    profileSelect.value = getActiveProfileId();
    syncProfileDescription();
    profileSelect.addEventListener('change', () => {
      const profile = getProfile(profileSelect.value);
      saveActiveProfile(profileSelect.value);
      Object.assign(weights, profile.weights);
      saveWeights({ ...weights });
      factors.forEach(f => {
        document.getElementById(`w-${f}`).value = weights[f];
        document.getElementById(`pct-${f}`).textContent = weights[f] + '%';
      });
      syncProfileDescription();
      onChangeCallback({ ...weights });
    });
  }

  document.getElementById('btn-reset-weights').addEventListener('click', () => {
    const w = resetWeights();
    factors.forEach(f => {
      document.getElementById(`w-${f}`).value = w[f];
      document.getElementById(`pct-${f}`).textContent = w[f] + '%';
    });
    Object.assign(weights, w);
    onChangeCallback({ ...w });
  });

  // Alert threshold
  const alertInput = document.getElementById('alert-threshold');
  const threshold = getAlertThreshold();
  if (threshold != null) alertInput.value = threshold;
  alertInput.addEventListener('change', () => {
    const v = parseInt(alertInput.value, 10);
    saveAlertThreshold(isNaN(v) ? null : v);
  });
}
