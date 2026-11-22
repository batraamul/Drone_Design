/**
 * Avionics block diagram (Build 3): components arranged in three columns
 * (power → control → devices) with power and data connections drawn between them.
 * Generated from project.modules.components; it redraws on every change.
 */
import { s } from '../utils/dom.js';
import { componentType } from '../engineering/components.js';

const BOX_W = 190;
const BOX_H = 48;
const GAP_Y = 18;
const COL_X = [20, 300, 580];
const TOP = 34;

const COLUMN_OF = { power: 0, control: 1 };
const COLUMN_TITLES = ['Power', 'Flight control', 'Devices'];

export const LINK_STYLES = Object.freeze({
  power: { label: 'Power' },
  uart: { label: 'UART' },
  i2c: { label: 'I²C' },
  spi: { label: 'SPI' },
  can: { label: 'CAN' },
  pwm: { label: 'PWM / DShot' },
  usb: { label: 'USB' },
  ethernet: { label: 'Ethernet' },
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * @param {{items, connections}} components
 * @param {{severityById?: Map<string,'error'|'warning'|'info'>, rails?: Map<string,{min,max}>}} options
 */
export function drawBlockDiagram(components, { severityById = new Map(), rails = new Map() } = {}) {
  const items = components?.items ?? [];
  const columns = [[], [], []];
  for (const item of items) columns[COLUMN_OF[componentType(item.type)?.group] ?? 2].push(item);
  const pos = new Map();
  columns.forEach((list, col) => list.forEach((item, row) => pos.set(item.id, { x: COL_X[col], y: TOP + row * (BOX_H + GAP_Y), col })));
  const rows = Math.max(1, ...columns.map((c) => c.length));
  const height = TOP + rows * (BOX_H + GAP_Y) + 10;
  const width = COL_X[2] + BOX_W + 20;

  // Per-box port offsets so parallel links do not overlap.
  const used = new Map();
  const slot = (id, side) => {
    const key = `${id}:${side}`;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return 10 + ((n * 9) % (BOX_H - 16));
  };

  const links = (components?.connections ?? [])
    .filter((c) => pos.has(c.from) && pos.has(c.to))
    .map((c) => {
      const a = pos.get(c.from);
      const b = pos.get(c.to);
      let x1;
      let x2;
      let path;
      if (a.col === b.col) {
        x1 = a.x + BOX_W;
        x2 = b.x + BOX_W;
        const y1 = a.y + slot(c.from, 'r');
        const y2 = b.y + slot(c.to, 'r');
        const bulge = 26 + Math.abs(y2 - y1) * 0.08;
        path = `M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`;
      } else {
        const forward = a.col < b.col;
        x1 = forward ? a.x + BOX_W : a.x;
        x2 = forward ? b.x : b.x + BOX_W;
        const y1 = a.y + slot(c.from, forward ? 'r' : 'l');
        const y2 = b.y + slot(c.to, forward ? 'l' : 'r');
        const mid = (x1 + x2) / 2;
        path = `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
      }
      return s('path', { class: `bd__link bd__link--${c.kind}`, d: path, dataset: { kind: c.kind } }, s('title', null, `${LINK_STYLES[c.kind]?.label ?? c.kind}`));
    });

  const boxes = items.map((item) => {
    const p = pos.get(item.id);
    const t = componentType(item.type);
    const severity = severityById.get(item.id);
    const rail = rails.get(item.id);
    const sub = [t?.label ?? item.type, item.quantity > 1 ? `× ${item.quantity}` : null, rail ? (rail.min === rail.max ? `${rail.min.toFixed(1)} V out` : `${rail.min.toFixed(1)}–${rail.max.toFixed(1)} V`) : null].filter(Boolean).join(' · ');
    return s(
      'g',
      { class: ['bd__box', `bd__box--${t?.group ?? 'other'}`, severity ? `bd__box--${severity}` : null].filter(Boolean).join(' '), dataset: { component: item.id } },
      s('rect', { x: p.x, y: p.y, width: BOX_W, height: BOX_H, rx: 7 }),
      s('text', { class: 'bd__name', x: p.x + 10, y: p.y + 20 }, clip(item.name, 26)),
      s('text', { class: 'bd__sub', x: p.x + 10, y: p.y + 37 }, clip(sub, 34)),
      s('title', null, `${item.name} (${t?.label ?? item.type})`),
    );
  });

  const titles = COLUMN_TITLES.map((title, i) => s('text', { class: 'bd__column', x: COL_X[i], y: 18 }, title));
  const description = `Block diagram with ${items.length} components and ${links.length} connections.`;
  return s('svg', { class: 'bd', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': description, style: { maxWidth: `${width}px` } }, s('title', null, description), titles, s('g', null, links), s('g', null, boxes));
}
