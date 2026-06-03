import { scoreColor, scoreLabel } from '../scoring.js';
import { suggest } from '../geocoding.js';

const FACTORS = [
  { key: 'overall', label: 'Overall' },
  { key: 'air', label: 'Air Quality' },
  { key: 'water', label: 'Water Safety' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'climate', label: 'Climate & Allergens' },
];

let primary = null;
let secondary = null;
let searchHandler = null;

const DEBOUNCE_MS = 400;
let debounceTimer = null;
let currentSuggestions = [];
let selectedIdx = -1;

export function initComparePanel(onSearch) {
  searchHandler = onSearch;

  const input = document.getElementById('compare-location-input');
  const list  = document.getElementById('compare-suggestions');

  document.getElementById('compare-search-btn').addEventListener('click', runSecondarySearch);
  document.getElementById('compare-clear').addEventListener('click', clearCompare);

  // Debounced autocomplete
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { hideSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
  });

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
    else if (e.key === 'Escape') { hideSuggestions(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && currentSuggestions[selectedIdx]) {
        selectSuggestion(currentSuggestions[selectedIdx]);
      } else {
        runSecondarySearch();
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.compare-input-wrap')) hideSuggestions();
  });

  async function fetchSuggestions(q) {
    const results = await suggest(q);
    currentSuggestions = results;
    selectedIdx = -1;
    if (!results.length) { hideSuggestions(); return; }

    list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.setAttribute('role', 'option');
      li.dataset.idx = i;
      li.innerHTML = `<svg class="suggestion-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.3"/></svg>${escHtml(r.label)}`;
      li.addEventListener('mousedown', e => { e.preventDefault(); selectSuggestion(r); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function selectSuggestion(suggestion) {
    input.value = suggestion.label;
    hideSuggestions();
    runSecondarySearchWith(suggestion.label);
  }

  function hideSuggestions() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    selectedIdx = -1;
    currentSuggestions = [];
  }

  function moveFocus(dir) {
    const items = list.querySelectorAll('.suggestion-item');
    if (!items.length) return;
    items[selectedIdx]?.removeAttribute('aria-selected');
    selectedIdx = Math.max(0, Math.min(items.length - 1, selectedIdx + dir));
    items[selectedIdx].setAttribute('aria-selected', 'true');
    items[selectedIdx].scrollIntoView({ block: 'nearest' });
    input.value = currentSuggestions[selectedIdx].label;
  }
}

export function openCompare(result) {
  primary = result;
  secondary = null;
  renderCompare();

  const section = document.getElementById('compare-section');
  section.hidden = false;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('compare-location-input').focus();
}

export function clearCompare() {
  primary = null;
  secondary = null;
  document.getElementById('compare-section').hidden = true;
  setCompareStatus('');
}

async function runSecondarySearchWith(query) {
  if (!query || !primary || !searchHandler) return;
  setCompareStatus('Comparing region...');
  document.getElementById('compare-search-btn').disabled = true;
  try {
    secondary = await searchHandler(query);
    renderCompare();
    setCompareStatus('');
  } catch (err) {
    setCompareStatus(err.message || 'Could not compare that region.');
  } finally {
    document.getElementById('compare-search-btn').disabled = false;
  }
}

async function runSecondarySearch() {
  const input = document.getElementById('compare-location-input');
  const query = input.value.trim();
  if (!query || !primary || !searchHandler) return;

  setCompareStatus('Comparing region...');
  document.getElementById('compare-search-btn').disabled = true;
  try {
    secondary = await searchHandler(query);
    renderCompare();
    setCompareStatus('');
  } catch (err) {
    setCompareStatus(err.message || 'Could not compare that region.');
  } finally {
    document.getElementById('compare-search-btn').disabled = false;
  }
}

function renderCompare() {
  const grid = document.getElementById('compare-grid');
  const table = document.getElementById('compare-table');

  grid.innerHTML = [
    renderLocationCard(primary, 'Current region'),
    secondary ? renderLocationCard(secondary, 'Comparison region') : renderEmptyCard(),
  ].join('');

  table.innerHTML = secondary ? renderHeader(primary, secondary) + renderRows(primary, secondary) + renderInsights(primary, secondary) : '';
}

function renderLocationCard(result, eyebrow) {
  const label = scoreLabel(result.overall);
  const scored = isScored(result.overall);
  return `
    <article class="compare-col">
      <div class="compare-eyebrow">${escHtml(eyebrow)}</div>
      <div class="compare-col-title">${escHtml(result.location)}</div>
      <div class="compare-score" style="color:${scoreColor(result.overall)}">${formatScore(result.overall)}</div>
      <span class="compare-badge ${label.badgeCls}">${label.label}</span>
      ${result.risk ? `<div class="compare-meta">Confidence ${escHtml(result.risk.confidence)} · ${scored ? `Range ${result.risk.range[0]}-${result.risk.range[1]}` : 'Range unavailable'}</div>` : ''}
      ${result.risk?.redFlags?.length ? `<div class="compare-meta">${result.risk.redFlags.length} dealbreaker flag${result.risk.redFlags.length === 1 ? '' : 's'}</div>` : ''}
    </article>
  `;
}

function renderEmptyCard() {
  return `
    <article class="compare-col compare-empty">
      <div class="compare-eyebrow">Comparison region</div>
      <div class="compare-placeholder">Enter a city or ZIP code to compare against the current result.</div>
    </article>
  `;
}

function renderRows(left, right) {
  return FACTORS.map(factor => {
    const leftScore = factor.key === 'overall' ? left.overall : left.scores[factor.key];
    const rightScore = factor.key === 'overall' ? right.overall : right.scores[factor.key];
    const canCompare = isScored(leftScore) && isScored(rightScore);
    const delta = canCompare ? rightScore - leftScore : null;
    const deltaText = !canCompare ? 'N/A' : delta === 0 ? 'Even' : `${delta > 0 ? '+' : ''}${delta}`;
    const deltaCls = delta > 0 ? 'delta-better' : delta < 0 ? 'delta-worse' : 'delta-even';
    return `
      <div class="compare-row">
        <span class="compare-label">${factor.label}</span>
        <span class="compare-val" style="color:${scoreColor(leftScore)}">${formatScore(leftScore)}</span>
        <span class="compare-val" style="color:${scoreColor(rightScore)}">${formatScore(rightScore)}</span>
        <span class="compare-delta ${deltaCls}">${deltaText}</span>
      </div>
    `;
  }).join('');
}

function renderHeader(left, right) {
  return `
    <div class="compare-row compare-row-head">
      <span></span>
      <span>${escHtml(shortName(left.location))}</span>
      <span>${escHtml(shortName(right.location))}</span>
      <span>Diff</span>
    </div>
  `;
}

function renderInsights(left, right) {
  const diffs = FACTORS
    .filter(factor => factor.key !== 'overall')
    .filter(factor => isScored(left.scores[factor.key]) && isScored(right.scores[factor.key]))
    .map(factor => ({
      ...factor,
      delta: right.scores[factor.key] - left.scores[factor.key],
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const strongest = diffs[0];
  const winner = isScored(right.overall) && isScored(left.overall)
    ? right.overall > left.overall ? right : left.overall > right.overall ? left : null
    : null;
  const flagDiff = (right.risk?.redFlags?.length ?? 0) - (left.risk?.redFlags?.length ?? 0);
  const lines = [
    strongest && `${strongest.label} is the biggest difference (${strongest.delta > 0 ? '+' : ''}${strongest.delta} for ${shortName(right.location)}).`,
    winner ? `${shortName(winner.location)} has the stronger adjusted score after confidence and red-flag penalties.` : 'The adjusted overall scores are unavailable or even.',
    flagDiff !== 0 ? `${shortName(flagDiff > 0 ? right.location : left.location)} has more dealbreaker flags.` : 'Both locations have the same number of dealbreaker flags.',
  ].filter(Boolean);

  return `
    <div class="compare-insights">
      ${lines.map(line => `<p>${escHtml(line)}</p>`).join('')}
    </div>
  `;
}

function shortName(location) {
  return String(location).split(',')[0].trim();
}

function setCompareStatus(message) {
  document.getElementById('compare-status').textContent = message;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function isScored(score) {
  return score != null && Number.isFinite(score);
}

function formatScore(score) {
  return isScored(score) ? score : 'N/A';
}
