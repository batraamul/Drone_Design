/**
 * AEROLAB X icon set: original 24×24 line icons (1.75 stroke, round caps and joins).
 * Each icon is a list of SVG path strings built only from trusted constants.
 */
import { s } from '../utils/dom.js';

const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const ICONS = {
  dashboard: ['M4 4h7v8H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 14h7v6H4z'],
  folder: ['M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z'],
  multirotor: ['M8.2 8.2l2.3 2.3', 'M15.8 8.2l-2.3 2.3', 'M8.2 15.8l2.3-2.3', 'M15.8 15.8l-2.3-2.3', 'M10.5 10.5h3v3h-3z', c(6, 6, 3), c(18, 6, 3), c(6, 18, 3), c(18, 18, 3)],
  cube: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
  chip: ['M7 7h10v10H7z', 'M10 10h4v4h-4z', 'M9.5 3v4', 'M14.5 3v4', 'M9.5 17v4', 'M14.5 17v4', 'M3 9.5h4', 'M3 14.5h4', 'M17 9.5h4', 'M17 14.5h4'],
  propeller: [c(12, 12, 2), 'M10.2 11.2C7.5 8.8 3.8 9.2 3 11.3c.9 2 4.6 2.4 7.2.9', 'M13.8 12.8c2.7 2.4 6.4 2 7.2-.1-.9-2-4.6-2.4-7.2-.9', 'M6 18.5a9.5 9.5 0 0 0 12 0', 'M18 5.5a9.5 9.5 0 0 0-12 0'],
  battery: ['M3.5 8h14A1.5 1.5 0 0 1 19 9.5v5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8z', 'M21.5 10.5v3', 'M11 9.5l-2.5 3h3l-2.5 3'],
  airfoil: ['M3 13.5c3.5-5.5 11.5-6 18-1.8-6.5 2-12 3.3-18 1.8z', 'M3 7.5h6', 'M6 18.5h8', 'M14 5.5h5'],
  attitude: [c(12, 12, 9), 'M3.6 14.2l16.8-4.4', 'M12 3v2', 'M12 19v2', 'M9.5 16.5h5'],
  truss: ['M3 20h18', 'M5 20l4-13h6l4 13', 'M9 7l3 13 3-13', 'M7 13.5h10'],
  camera: ['M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', c(12, 13, 3.5)],
  route: [c(6, 18, 2), c(18, 6, 2), 'M7.6 16.8C10 15 9.5 12 12 11s3.5-2.5 4.4-3.8', 'M3 6h3', 'M18 18h3'],
  simulator: ['M3 4.5h18v12H3z', 'M8 20.5h8', 'M12 16.5v4', 'M10 8v5l4.5-2.5z'],
  neural: [c(5, 6, 2), c(5, 18, 2), c(12, 12, 2), c(19, 6, 2), c(19, 18, 2), 'M6.6 7.4l3.8 3.4', 'M6.6 16.6l3.8-3.4', 'M13.6 10.8l3.8-3.4', 'M13.6 13.2l3.8 3.4'],
  insect: [c(12, 10, 2), 'M12 12v7', 'M10.4 8.9C7.5 5.8 3.8 6.3 4 8.8s4 3.2 6.3 1.8', 'M13.6 8.9c2.9-3.1 6.6-2.6 6.4-.1s-4 3.2-6.3 1.8', 'M10.8 6.5L9.5 4', 'M13.2 6.5L14.5 4'],
  shield: ['M12 3l8 3v6c0 4.6-3.4 8.4-8 9-4.6-.6-8-4.4-8-9V6z', 'M9 12l2.2 2.2L15.5 10'],
  component: ['M2.5 12H6l1.5-3.5 3 7 3-7 3 7 1.5-3.5h3.5'],
  book: ['M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z', 'M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3', 'M9 7h6'],
  report: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6', 'M10 17h6'],
  sliders: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 12h3', 'M11 12h9', 'M9 10v4', 'M4 17h11', 'M19 17h1', 'M17 15v4'],
  search: [c(11, 11, 7), 'M20.5 20.5l-4.6-4.6'],
  bell: ['M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  save: ['M5 3h11l3 3v15H5z', 'M8 3v5h7V3', 'M8 14h8v7H8z'],
  sun: [c(12, 12, 4), 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
  moon: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  menu: ['M4 6.5h16', 'M4 12h16', 'M4 17.5h16'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  copy: ['M8.5 8.5h11v11h-11z', 'M5.5 15.5h-1v-11h11v1'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4v4h4', 'M12 7.5V12l3 2'],
  warning: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5', 'M12 17.2v.3'],
  error: [c(12, 12, 9), 'M9 9l6 6', 'M15 9l-6 6'],
  info: [c(12, 12, 9), 'M12 11v6', 'M12 7.5v.4'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  checkCircle: [c(12, 12, 9), 'M8 12.5l2.8 2.8L16 10'],
  restore: ['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v4h4'],
  compare: ['M8 4v16', 'M16 4v16', 'M4.5 7.5L8 4l3.5 3.5', 'M12.5 16.5L16 20l3.5-3.5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  terminal: ['M3.5 5h17v14h-17z', 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4.5'],
  panelLeft: ['M3.5 4.5h17v15h-17z', 'M9 4.5v15'],
  panelRight: ['M3.5 4.5h17v15h-17z', 'M15 4.5v15'],
  panelBottom: ['M3.5 4.5h17v15h-17z', 'M3.5 14.5h17'],
  note: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  tag: ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'],
  keyboard: ['M3 6h18v12H3z', 'M6.5 9.5h.01', 'M10 9.5h.01', 'M13.5 9.5h.01', 'M17 9.5h.01', 'M7 14h10'],
  database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  fixedWing: ['M12 2.5c1 0 1.5 1 1.5 2.5v5l7.5 3v2l-7.5-1.5v4.5l2.5 2v1.5L12 20.5l-4 1v-1.5l2.5-2v-4.5L3 15v-2l7.5-3V5c0-1.5.5-2.5 1.5-2.5z'],
  vtol: ['M12 3v18', 'M3 11.5h18', 'M9 20h6', 'M6.5 8v7', 'M17.5 8v7', c(6.5, 6.2, 1.8), c(6.5, 16.8, 1.8), c(17.5, 6.2, 1.8), c(17.5, 16.8, 1.8)],
  balloon: ['M12 3a6 6 0 0 1 6 6c0 4-4 7-6 8-2-1-6-4-6-8a6 6 0 0 1 6-6z', 'M12 17v2.5', 'M10 19.5h4V22h-4z'],
  play: ['M8 5v14l11-7z'],
  offline: ['M3 3l18 18', 'M8.5 16a5 5 0 0 1 6-.6', 'M5 12.5a10 10 0 0 1 4.6-2.4', 'M14.5 10.2A10 10 0 0 1 19 12.5', 'M2 9a15 15 0 0 1 4.3-2.6', 'M11 5.6A15 15 0 0 1 22 9', 'M12 19.5h.01'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  roadmap: ['M4 5h4v4H4z', 'M10 7h10', 'M4 15h4v4H4z', 'M10 17h10', 'M6 9v6'],
  lightning: ['M13 2.5L5 13.5h6L10 21.5l9-12h-6z'],
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/**
 * Build an icon element.
 * @param {string} name icon key
 * @param {{size?: number, label?: string, class?: string}} [options]
 *   With `label` the icon is announced (role="img"); otherwise it is decorative.
 */
export function icon(name, { size = 18, label, class: className } = {}) {
  const paths = ICONS[name] ?? ICONS.info;
  const svg = s(
    'svg',
    {
      class: ['icon', className],
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      role: label ? 'img' : undefined,
      'aria-hidden': label ? undefined : 'true',
      'aria-label': label,
    },
    paths.map((d) => s('path', { d })),
  );
  return svg;
}

/** The AEROLAB X logo mark: hexagonal frame with an X-configuration rotorcraft. */
export function logoMark({ size = 32, idSuffix = 'main' } = {}) {
  const gradientId = `logo-gradient-${idSuffix}`;
  return s(
    'svg',
    { class: 'logo-mark', viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    s(
      'defs',
      null,
      s(
        'linearGradient',
        { id: gradientId, x1: '0', y1: '0', x2: '1', y2: '1' },
        s('stop', { offset: '0', 'stop-color': '#22d3ee' }),
        s('stop', { offset: '1', 'stop-color': '#3b82f6' }),
      ),
    ),
    s('path', { d: 'M24 3.5l17.5 10.2v20.6L24 44.5 6.5 34.3V13.7z', fill: 'none', stroke: `url(#${gradientId})`, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M17 17l14 14M31 17L17 31', stroke: `url(#${gradientId})`, 'stroke-width': 2.4, 'stroke-linecap': 'round' }),
    ...[
      [16, 16],
      [32, 16],
      [16, 32],
      [32, 32],
    ].map(([cx, cy]) => s('circle', { cx, cy, r: 4.6, fill: 'none', stroke: `url(#${gradientId})`, 'stroke-width': 2 })),
    s('rect', { x: 20.5, y: 20.5, width: 7, height: 7, rx: 2, fill: `url(#${gradientId})` }),
  );
}
