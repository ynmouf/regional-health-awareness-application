import { scoreColor, scoreLabel } from '../scoring.js';

const LABELS = {
  overall: 'Overall Score',
  air: '🌬️ Air Quality',
  infection: '🦠 Infection Risk',
  healthcare: '🏥 Healthcare',
  climate: '🌡️ Climate',
};

let compareResults = [];

export function addCompareResult(result) {
  // Limit to 3 locations
  if (compareResults.length >= 3) compareResults.shift();
  // Remove existing entry for same location
  compareResults = compareResults.filter(r => r.location !== result.location);
  compareResults.push(result);
  renderCompare();
}

export function clearCompare() {
  compareResults = [];
  document.getElementById('compare-section').hidden = true;
}

function renderCompare() {
  const section = document.getElementById('compare-section');
  const grid = document.getElementById('compare-grid');
  grid.innerHTML = '';

  compareResults.forEach(r => {
    const col = document.createElement('div');
    col.className = 'compare-col';
    col.innerHTML = `
      <div class="compare-col-title">${escHtml(r.location)}</div>
      ${Object.entries(LABELS).map(([key, label]) => {
        const score = key === 'overall' ? r.overall : r.scores[key];
        return `
          <div class="compare-row">
            <span class="compare-label">${label}</span>
            <span class="compare-val" style="color:${scoreColor(score)}">${score}</span>
          </div>
        `;
      }).join('')}
    `;
    grid.appendChild(col);
  });

  section.hidden = compareResults.length < 2;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
