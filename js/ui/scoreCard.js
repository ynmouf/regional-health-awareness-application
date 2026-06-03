import { scoreLabel, scoreColor } from '../scoring.js';

let radarChart = null;

export function renderOverall(location, overallScore) {
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
}

export function renderRadarChart(scores) {
  const ctx = document.getElementById('radar-chart').getContext('2d');
  const data = {
    labels: ['Air Quality', 'Infection Risk', 'Healthcare', 'Climate'],
    datasets: [{
      data: [scores.air, scores.infection, scores.healthcare, scores.climate],
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
  radarChart.data.datasets[0].data = [scores.air, scores.infection, scores.healthcare, scores.climate];
  radarChart.update('active');
}
