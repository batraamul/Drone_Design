/**
 * Lightweight, dependency-free SVG line charts for engineering plots.
 * Charts are accessible images (role="img" with a text description); the data
 * they show is always also available as a table next to them.
 * Heavier interactive plotting (zoom, many series) will use a vendored charting
 * library from Build 4 onwards.
 */
import { s } from '../utils/dom.js';

/** "Nice" tick values covering [min, max] with roughly `count` intervals. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step - 1e-9) * step;
  const ticks = [];
  for (let value = start; value <= max + step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)));
  return ticks;
}

function formatTick(value) {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return value.toExponential(1);
  return String(Number(value.toPrecision(4)));
}

/**
 * @param {{points: [number, number][], xLabel: string, yLabel: string, title: string, description: string,
 *          marker?: [number, number], width?: number, height?: number, xDomain?: [number, number], yDomain?: [number, number],
 *          tone?: 'accent'|'secondary'}} options
 */
export function lineChart({ points, xLabel, yLabel, title, description, marker, width = 360, height = 260, xDomain, yDomain, tone = 'accent', extra = [], label = null }) {
  const margin = { top: 28, right: 16, bottom: 44, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const all = [points, ...extra.map((e) => e.points)].flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const xTicks = niceTicks(x0, x1, 4);
  const yTicks = niceTicks(y0, y1, 5);
  const xMin = Math.min(x0, xTicks[0] ?? x0);
  const xMax = Math.max(x1, xTicks.at(-1) ?? x1);
  const yMin = Math.min(y0, yTicks[0] ?? y0);
  const yMax = Math.max(y1, yTicks.at(-1) ?? y1);
  const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const sy = (y) => margin.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(2)} ${sy(p[1]).toFixed(2)}`).join(' ');

  return s(
    'svg',
    { class: ['chart', `chart--${tone}`], viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${title}. ${description}`, preserveAspectRatio: 'xMidYMid meet' },
    s('title', null, title),
    s('text', { class: 'chart__title', x: margin.left, y: 16 }, title),
    ...yTicks.map((tick) =>
      s(
        'g',
        { class: 'chart__tick' },
        s('line', { class: 'chart__grid', x1: margin.left, x2: margin.left + innerW, y1: sy(tick), y2: sy(tick) }),
        s('text', { class: 'chart__label', x: margin.left - 8, y: sy(tick) + 4, 'text-anchor': 'end' }, formatTick(tick)),
      ),
    ),
    ...xTicks.map((tick) =>
      s(
        'g',
        { class: 'chart__tick' },
        s('line', { class: 'chart__grid', x1: sx(tick), x2: sx(tick), y1: margin.top, y2: margin.top + innerH }),
        s('text', { class: 'chart__label', x: sx(tick), y: margin.top + innerH + 16, 'text-anchor': 'middle' }, formatTick(tick)),
      ),
    ),
    s('rect', { class: 'chart__frame', x: margin.left, y: margin.top, width: innerW, height: innerH }),
    s('path', { class: 'chart__line', d: path }),
    ...extra.map((e) => s('path', { class: ['chart__line', 'chart__line--extra', e.dashed ? 'chart__line--dashed' : null], d: e.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(2)} ${sy(p[1]).toFixed(2)}`).join(' ') })),
    extra.length && label
      ? s('g', { class: 'chart__legend' }, s('text', { x: margin.left + innerW - 4, y: margin.top + 12, 'text-anchor': 'end' }, [label, ...extra.map((e) => e.label)].join('  ·  ')))
      : null,
    marker
      ? s(
          'g',
          { class: 'chart__marker' },
          s('line', { x1: margin.left, x2: margin.left + innerW, y1: sy(marker[1]), y2: sy(marker[1]), class: 'chart__marker-line' }),
          s('circle', { cx: sx(marker[0]), cy: sy(marker[1]), r: 4.5 }),
        )
      : null,
    s('text', { class: 'chart__axis', x: margin.left + innerW / 2, y: height - 6, 'text-anchor': 'middle' }, xLabel),
    s('text', { class: 'chart__axis', x: 14, y: margin.top + innerH / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${margin.top + innerH / 2})` }, yLabel),
  );
}
