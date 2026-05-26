// Thin Chart.js wrappers themed to the app. Auto-registers required components.
import {
  Chart, LineController, BarController, DoughnutController,
  LineElement, PointElement, BarElement, ArcElement,
  CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Filler,
} from 'chart.js';

Chart.register(
  LineController, BarController, DoughnutController,
  LineElement, PointElement, BarElement, ArcElement,
  CategoryScale, LinearScale, TimeScale, Tooltip, Legend, Filler,
);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseOpts() {
  const text2 = cssVar('--text-2') || '#9fb0d0';
  const border = cssVar('--border') || '#1e2c4a';
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: text2, boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: cssVar('--surface-2') || '#15233f',
        borderColor: border, borderWidth: 1, titleColor: cssVar('--text'),
        bodyColor: text2, padding: 10, cornerRadius: 8,
      },
    },
    scales: {
      x: { ticks: { color: text2, font: { size: 10 } }, grid: { color: border } },
      y: { ticks: { color: text2, font: { size: 10 } }, grid: { color: border }, beginAtZero: true },
    },
  };
}

export const PALETTE = ['#2dd4bf', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#a3e635', '#22d3ee', '#e879f9'];

export function lineChart(canvas, { labels, datasets }, extra = {}) {
  const accent = cssVar('--accent') || '#2dd4bf';
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        borderColor: d.color || PALETTE[i % PALETTE.length],
        backgroundColor: (d.fill ? hexA(d.color || accent, 0.15) : 'transparent'),
        fill: !!d.fill, tension: 0.35, borderWidth: 2, pointRadius: d.points ? 3 : 0,
        pointBackgroundColor: d.color || PALETTE[i % PALETTE.length], ...d,
      })),
    },
    options: { ...baseOpts(), ...extra },
  });
}

export function barChart(canvas, { labels, datasets }, extra = {}) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        backgroundColor: d.colors || d.color || PALETTE[i % PALETTE.length],
        borderRadius: 5, ...d,
      })),
    },
    options: { ...baseOpts(), ...extra },
  });
}

export function doughnutChart(canvas, { labels, data, colors }, extra = {}) {
  const opts = baseOpts();
  delete opts.scales;
  return new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors || PALETTE, borderWidth: 0, hoverOffset: 6 }] },
    options: { ...opts, cutout: '64%', ...extra },
  });
}

function hexA(hex, a) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
