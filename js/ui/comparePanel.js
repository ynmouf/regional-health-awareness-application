import { scoreColor, scoreLabel } from '../scoring.js';

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

export function initComparePanel(onSearch) {
  searchHandler = onSearch;

  document.getElementById('compare-search-btn').addEventListener('click', runSecondarySearch);
  document.getElementById('compare-location-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSecondarySearch();
  });
  document.getElementById('compare-clear').addEventListener('click', clearCompare);
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
  return `
    <article class="compare-col">
      <div class="compare-eyebrow">${escHtml(eyebrow)}</div>
      <div class="compare-col-title">${escHtml(result.location)}</div>
      <div class="compare-score" style="color:${scoreColor(result.overall)}">${result.overall}</div>
      <span class="compare-badge ${label.badgeCls}">${label.label}</span>
      ${result.risk ? `<div class="compare-meta">Confidence ${escHtml(result.risk.confidence)} · Range ${result.risk.range[0]}-${result.risk.range[1]}</div>` : ''}
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
    const delta = rightScore - leftScore;
    const deltaText = delta === 0 ? 'Even' : `${delta > 0 ? '+' : ''}${delta}`;
    const deltaCls = delta > 0 ? 'delta-better' : delta < 0 ? 'delta-worse' : 'delta-even';
    return `
      <div class="compare-row">
        <span class="compare-label">${factor.label}</span>
        <span class="compare-val" style="color:${scoreColor(leftScore)}">${leftScore}</span>
        <span class="compare-val" style="color:${scoreColor(rightScore)}">${rightScore}</span>
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
    .map(factor => ({
      ...factor,
      delta: (right.scores[factor.key] ?? 0) - (left.scores[factor.key] ?? 0),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const strongest = diffs[0];
  const winner = right.overall > left.overall ? right : left.overall > right.overall ? left : null;
  const flagDiff = (right.risk?.redFlags?.length ?? 0) - (left.risk?.redFlags?.length ?? 0);
  const lines = [
    strongest && `${strongest.label} is the biggest difference (${strongest.delta > 0 ? '+' : ''}${strongest.delta} for ${shortName(right.location)}).`,
    winner ? `${shortName(winner.location)} has the stronger adjusted score after confidence and red-flag penalties.` : 'The adjusted overall scores are even.',
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
