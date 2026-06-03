import { monthlyRiskScore, scoreColor } from '../scoring.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function renderSeasonalCalendar(monthlyData) {
  const container = document.getElementById('seasonal-calendar');
  container.innerHTML = '';
  const months = Array.isArray(monthlyData) ? monthlyData : monthlyData?.months;

  if (!months || !months.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:.85rem;grid-column:1/-1">Seasonal data unavailable for this location.</p>';
    return;
  }

  months.forEach((data, i) => {
    const score = monthlyRiskScore(data);
    const color = scoreColor(score);
    const cell = document.createElement('div');
    cell.className = 'month-cell';
    cell.style.background = hexToRgba(color, 0.18);
    cell.style.color = color;
    cell.style.border = `1.5px solid ${hexToRgba(color, 0.35)}`;
    cell.setAttribute('title', `${MONTHS[i]}: Score ${score}/100`);
    cell.setAttribute('aria-label', `${MONTHS[i]}: risk score ${score} out of 100`);
    cell.innerHTML = `<div>${score}</div><div class="month-label">${MONTHS[i]}</div>`;
    container.appendChild(cell);
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
