import { scoreLabel, scoreColor } from '../scoring.js';

let radarChart = null;

export function renderOverall(location, overallScore, risk = null, profile = null) {
  const lbl = scoreLabel(overallScore);
  const color = scoreColor(overallScore);

  document.getElementById('result-location').textContent = location;

  const numEl = document.getElementById('score-number');
  numEl.textContent = overallScore;
  numEl.className = `score-number score-${lbl.cls}`;

  const badge = document.getElementById('score-badge');
  badge.textContent = lbl.label;
  badge.className = `score-badge ${lbl.badgeCls}`;

  const fill = document.getElementById('gauge-fill');
  fill.style.width = `${overallScore}%`;
  fill.style.background = color;

  const meta = document.getElementById('score-meta');
  if (meta && risk) {
    meta.hidden = false;
    document.getElementById('score-confidence').textContent = `Confidence ${risk.confidence}`;
    document.getElementById('score-range').textContent = `Range ${risk.range[0]}-${risk.range[1]}`;
    document.getElementById('score-completeness').textContent =
      `${risk.dataCompleteness.used}/${risk.dataCompleteness.total} strong data categories · ${profile?.label ?? 'General profile'}`;
  } else if (meta) {
    meta.hidden = true;
  }
}

export function renderRiskIntelligence(risk) {
  const section = document.getElementById('risk-intelligence');
  const list = document.getElementById('red-flag-list');
  if (!section || !list || !risk) return;

  const flags = risk.redFlags ?? [];
  section.hidden = false;
  if (!flags.length) {
    list.innerHTML = '<div class="red-flag-item low"><strong>No dealbreaker flags found.</strong><span>Review detail panels before making a health decision.</span></div>';
    return;
  }

  list.innerHTML = flags.slice(0, 6).map(flag => `
    <div class="red-flag-item ${escAttr(flag.severity)}">
      <strong>${escHtml(flag.title)}</strong>
      <span>${escHtml(flag.text)}</span>
    </div>
  `).join('');
}

export function renderCategoryCard(id, score, summary, confidence) {
  const lbl = scoreLabel(score);
  const color = scoreColor(score);

  const scoreEl = document.getElementById(`score-${id}`);
  scoreEl.textContent = score;
  scoreEl.className = `card-score score-${lbl.cls}`;

  const bar = document.getElementById(`bar-${id}`);
  bar.style.width = `${score}%`;
  bar.style.background = color;

  document.getElementById(`summary-${id}`).textContent = summary;

  const conf = document.getElementById(`conf-${id}`);
  conf.textContent = lbl.label;
  conf.className = `confidence-badge ${lbl.badgeCls}`;
  conf.title = `Data confidence: ${confidence}`;

  const dataConf = document.getElementById(`data-conf-${id}`);
  if (dataConf) {
    dataConf.textContent = `Data confidence: ${formatConfidence(confidence)}`;
  }
}

function formatConfidence(confidence) {
  if (!confidence) return 'Unknown';
  const value = String(confidence).trim().toLowerCase();
  return value ? value[0].toUpperCase() + value.slice(1) : 'Unknown';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  return String(str).replace(/[^a-z0-9_-]/gi, '');
}

export function renderRadarChart(scores) {
  const ctx = document.getElementById('radar-chart').getContext('2d');
  const data = {
    labels: ['Air Quality', 'Toxin Burden', 'Healthcare', 'Climate'],
    datasets: [{
      data: [scores.air, scores.water, scores.healthcare, scores.climate],
      backgroundColor: 'rgba(79,110,247,.15)',
      borderColor: 'rgba(79,110,247,.8)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(79,110,247,1)',
      pointRadius: 4,
    }],
  };
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type: 'radar',
    data,
    options: {
      scales: {
        r: {
          min: 0, max: 100, ticks: { stepSize: 25, font: { size: 10 }, color: '#9099b5' },
          pointLabels: { font: { size: 11 }, color: '#5a6078' },
          grid: { color: '#e2e6ef' },
          angleLines: { color: '#e2e6ef' },
        },
      },
      plugins: { legend: { display: false } },
      animation: { duration: 600 },
    },
  });
}

export function updateRadarChart(scores) {
  if (!radarChart) { renderRadarChart(scores); return; }
  radarChart.data.datasets[0].data = [scores.air, scores.water, scores.healthcare, scores.climate];
  radarChart.update('active');
}
