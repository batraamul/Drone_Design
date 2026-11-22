/**
 * Orthographic 2D views (top, front, side) of the conceptual geometry, drawn as SVG.
 * The drawing is generated from computeGeometry() output and is redrawn on every
 * parameter change. Coordinates: body frame x forward, y right, z up (metres).
 *
 *   top   : screen right = +y (right wing), screen up = +x (nose up the page)
 *   front : seen from ahead of the aircraft: screen right = −y, screen up = +z
 *   side  : seen from the left: screen right = −x (nose on the left), screen up = +z
 */
import { s } from '../utils/dom.js';

const W = 360;
const H = 250;
const PAD = 24;

const PROJECT = {
  top: (p) => [p.y, p.x],
  front: (p) => [-p.y, p.z],
  side: (p) => [-p.x, p.z],
};

export const VIEW_LABELS = Object.freeze({ top: 'Top view', front: 'Front view', side: 'Side view' });

function boundsFor(geo, view) {
  const e = geo.extents;
  const corners = [];
  for (const x of e.x) for (const y of e.y) for (const z of e.z) corners.push(PROJECT[view]({ x, y, z }));
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  return { u: [Math.min(...us), Math.max(...us)], v: [Math.min(...vs), Math.max(...vs)] };
}

function makeTransform(bounds) {
  const du = Math.max(bounds.u[1] - bounds.u[0], 1e-6);
  const dv = Math.max(bounds.v[1] - bounds.v[0], 1e-6);
  const scale = Math.min((W - 2 * PAD) / du, (H - 2 * PAD - 14) / dv);
  const cu = (bounds.u[0] + bounds.u[1]) / 2;
  const cv = (bounds.v[0] + bounds.v[1]) / 2;
  return { scale, map: ([u, v]) => [W / 2 + (u - cu) * scale, (H - 14) / 2 - (v - cv) * scale] };
}

const fmt = (n) => (Math.round(n * 10) / 10).toString();
const pts = (list) => list.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');

/** Largest 1, 2 or 5 × 10ⁿ not above 1.4 × target (a readable scale-bar length). */
export function niceLength(target) {
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [10, 5, 2, 1].map((f) => f * magnitude).find((v) => v <= target * 1.4) ?? magnitude;
}

function scaleBar(scale) {
  const length = niceLength(70 / scale);
  const px = length * scale;
  const label = length >= 1 ? `${+length.toPrecision(3)} m` : `${+(length * 1000).toPrecision(3)} mm`;
  const y = H - 10;
  return s(
    'g',
    { class: 'view2d__scale' },
    s('line', { x1: PAD, y1: y, x2: PAD + px, y2: y }),
    s('line', { x1: PAD, y1: y - 4, x2: PAD, y2: y + 4 }),
    s('line', { x1: PAD + px, y1: y - 4, x2: PAD + px, y2: y + 4 }),
    s('text', { x: PAD + px + 6, y: y + 4 }, label),
  );
}

/** Points of a straight-tapered surface half (root at y = 0) as [{x,y,z}] in the body frame. */
function surfaceHalf({ xRootLE, rootChord, tipChord, halfSpan, sweep, dihedral, z0 = 0 }, side) {
  const tipLE = xRootLE - halfSpan * Math.tan(sweep);
  const zt = z0 + halfSpan * Math.tan(dihedral);
  return [
    { x: xRootLE, y: 0, z: z0 },
    { x: tipLE, y: side * halfSpan, z: zt },
    { x: tipLE - tipChord, y: side * halfSpan, z: zt },
    { x: xRootLE - rootChord, y: 0, z: z0 },
  ];
}

function rotorShape(r, view, map, scale, index) {
  const radius = (r.diameter / 2) * scale;
  const [cx, cy] = map(PROJECT[view](r));
  const faceOn = (view === 'top' && r.axis === 'z') || ((view === 'front') && r.axis === 'x');
  const cls = ['view2d__rotor', `view2d__rotor--${r.role}`, r.level === 'lower' ? 'view2d__rotor--lower' : null].filter(Boolean).join(' ');
  if (faceOn) {
    const group = s('g', { class: cls }, s('circle', { cx: fmt(cx), cy: fmt(cy), r: fmt(radius) }), s('circle', { class: 'view2d__hub', cx: fmt(cx), cy: fmt(cy), r: fmt(Math.max(1.5, radius * 0.08)) }));
    if (view === 'top' && r.level !== 'lower') {
      // Spin arrow on the disc edge: counter-clockwise or clockwise seen from above.
      const ccw = r.spin === 'ccw';
      const a0 = -Math.PI / 2;
      const a1 = a0 + (ccw ? -1 : 1) * 0.9;
      const rr = radius * 0.72;
      const x0 = cx + rr * Math.cos(a0);
      const y0 = cy + rr * Math.sin(a0);
      const x1 = cx + rr * Math.cos(a1);
      const y1 = cy + rr * Math.sin(a1);
      group.append(s('path', { class: 'view2d__spin', d: `M${fmt(x0)},${fmt(y0)} A${fmt(rr)},${fmt(rr)} 0 0 ${ccw ? 0 : 1} ${fmt(x1)},${fmt(y1)}` }));
      if (index !== undefined) group.append(s('text', { class: 'view2d__rotor-label', x: fmt(cx), y: fmt(cy + 3.5) }, String(index)));
    }
    return group;
  }
  // Edge-on disc: a line across the diameter, perpendicular to the rotor axis.
  if (r.axis === 'z') return s('line', { class: cls, x1: fmt(cx - radius), y1: fmt(cy), x2: fmt(cx + radius), y2: fmt(cy) });
  if (view === 'side') return s('line', { class: cls, x1: fmt(cx), y1: fmt(cy - radius), x2: fmt(cx), y2: fmt(cy + radius) });
  return s('line', { class: cls, x1: fmt(cx - radius), y1: fmt(cy), x2: fmt(cx + radius), y2: fmt(cy) });
}

function multirotorParts(geo, view, map, scale) {
  const parts = [];
  for (const arm of geo.arms) {
    const [x1, y1] = map(PROJECT[view](arm.from));
    const [x2, y2] = map(PROJECT[view](arm.to));
    parts.push(s('line', { class: 'view2d__arm', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
  }
  const { diameter: d, height: hgt } = geo.body;
  const [cx, cy] = map(PROJECT[view]({ x: 0, y: 0, z: 0 }));
  if (view === 'top') parts.push(s('circle', { class: 'view2d__body', cx: fmt(cx), cy: fmt(cy), r: fmt((d / 2) * scale) }));
  else parts.push(s('rect', { class: 'view2d__body', x: fmt(cx - (d / 2) * scale), y: fmt(cy - (hgt / 2) * scale), width: fmt(d * scale), height: fmt(hgt * scale), rx: 2 }));
  const seen = [];
  geo.rotors.forEach((r) => {
    const axisIndex = seen.findIndex((p) => p.x === r.x && p.y === r.y);
    if (axisIndex < 0) seen.push(r);
    parts.push(rotorShape(r, view, map, scale, axisIndex < 0 ? seen.length : undefined));
  });
  if (view === 'top') parts.push(noseArrow(map, scale, geo.extents.x[1]));
  return parts;
}

function noseArrow(map, scale, xFront) {
  const [x, y] = map(PROJECT.top({ x: xFront, y: 0, z: 0 }));
  const top = Math.max(6, y - 4);
  return s('g', { class: 'view2d__nose' }, s('path', { d: `M${fmt(x)},${fmt(top - 8)} l-5,8 h10 z` }), s('text', { x: fmt(x + 9), y: fmt(top - 1) }, 'Front'));
}

function wingedParts(geo, view, map, scale) {
  const parts = [];
  const poly = (points, cls) => s('polygon', { class: cls, points: pts(points.map((p) => map(PROJECT[view](p)))) });
  const { wing, fuselage, tail } = geo;
  const half = wing.span / 2;
  const wingHalf = (side) => surfaceHalf({ xRootLE: wing.xRootLE, rootChord: wing.rootChord, tipChord: wing.tipChord, halfSpan: half, sweep: wing.sweepLE, dihedral: wing.dihedral }, side);

  // Fuselage
  const fr = fuselage.diameter / 2;
  if (view === 'top' || view === 'side') {
    const [x1, y1] = map(PROJECT[view]({ x: 0, y: -fr, z: fr }));
    const [x2, y2] = map(PROJECT[view]({ x: -fuselage.length, y: fr, z: -fr }));
    parts.push(s('rect', { class: 'view2d__body', x: fmt(Math.min(x1, x2)), y: fmt(Math.min(y1, y2)), width: fmt(Math.abs(x2 - x1)), height: fmt(Math.abs(y2 - y1)), rx: fmt(Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2) }));
  } else {
    const [cx, cy] = map(PROJECT.front({ x: 0, y: 0, z: 0 }));
    parts.push(s('circle', { class: 'view2d__body', cx: fmt(cx), cy: fmt(cy), r: fmt(fr * scale) }));
  }

  // Booms (quadplane)
  for (const b of geo.booms ?? []) {
    const [x1, y1] = map(PROJECT[view](b.from));
    const [x2, y2] = map(PROJECT[view](b.to));
    parts.push(s('line', { class: 'view2d__arm', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
  }

  // Wing
  if (view === 'top') {
    parts.push(poly(wingHalf(1), 'view2d__surface'), poly(wingHalf(-1), 'view2d__surface'));
    const macX = wing.xRootLE - wing.yMac * Math.tan(wing.sweepLE);
    for (const side of [1, -1]) {
      const [a, b] = [map(PROJECT.top({ x: macX, y: side * wing.yMac, z: 0 })), map(PROJECT.top({ x: macX - wing.mac, y: side * wing.yMac, z: 0 }))];
      parts.push(s('line', { class: 'view2d__mac', x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]) }));
    }
    const [acx, acy] = map(PROJECT.top({ x: wing.xAC, y: 0, z: 0 }));
    parts.push(s('g', { class: 'view2d__ac' }, s('circle', { cx: fmt(acx), cy: fmt(acy), r: 3 }), s('text', { x: fmt(acx + 6), y: fmt(acy - 4) }, 'AC')));
  } else if (view === 'front') {
    for (const side of [1, -1]) {
      const tip = { x: 0, y: side * half, z: half * Math.tan(wing.dihedral) };
      const [x1, y1] = map(PROJECT.front({ x: 0, y: 0, z: 0 }));
      const [x2, y2] = map(PROJECT.front(tip));
      parts.push(s('line', { class: 'view2d__surface-edge', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
    }
  } else {
    const rootTE = { x: wing.xRootLE - wing.rootChord, y: 0, z: 0 };
    const tipLE = { x: wing.xRootLE - half * Math.tan(wing.sweepLE), y: half, z: half * Math.tan(wing.dihedral) };
    parts.push(poly([{ x: wing.xRootLE, y: 0, z: 0 }, tipLE, { ...tipLE, x: tipLE.x - wing.tipChord }, rootTE], 'view2d__surface view2d__surface--thin'));
  }

  // Tail
  if (tail.type === 'conventional' || tail.type === 'v') {
    const hHalf = tail.span / 2;
    const dz = tail.type === 'v' ? Math.tan(tail.angle) : 0;
    const panel = (side) => [
      { x: tail.xLE, y: 0, z: 0 },
      { x: tail.xLE, y: side * hHalf, z: hHalf * dz },
      { x: tail.xLE - tail.chord, y: side * hHalf, z: hHalf * dz },
      { x: tail.xLE - tail.chord, y: 0, z: 0 },
    ];
    if (view === 'top') parts.push(poly(panel(1), 'view2d__surface'), poly(panel(-1), 'view2d__surface'));
    else if (view === 'front') {
      for (const side of [1, -1]) {
        const [x1, y1] = map(PROJECT.front({ x: 0, y: 0, z: 0 }));
        const [x2, y2] = map(PROJECT.front({ x: 0, y: side * hHalf, z: hHalf * dz }));
        parts.push(s('line', { class: 'view2d__surface-edge', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
      }
    } else parts.push(poly(panel(1), 'view2d__surface view2d__surface--thin'));
    if (tail.type === 'conventional') {
      const fin = [
        { x: tail.xLEv, y: 0, z: 0 },
        { x: tail.xLEv - tail.vChord * 0.35, y: 0, z: tail.vHeight },
        { x: tail.xLEv - tail.vChord, y: 0, z: tail.vHeight },
        { x: tail.xLEv - tail.vChord, y: 0, z: 0 },
      ];
      if (view === 'side') parts.push(poly(fin, 'view2d__surface'));
      else if (view === 'front') {
        const [x1, y1] = map(PROJECT.front({ x: 0, y: 0, z: 0 }));
        const [x2, y2] = map(PROJECT.front({ x: 0, y: 0, z: tail.vHeight }));
        parts.push(s('line', { class: 'view2d__surface-edge', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
      } else {
        const [x1, y1] = map(PROJECT.top({ x: tail.xLEv, y: 0, z: 0 }));
        const [x2, y2] = map(PROJECT.top({ x: tail.xLEv - tail.vChord, y: 0, z: 0 }));
        parts.push(s('line', { class: 'view2d__surface-edge', x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2) }));
      }
    }
  }

  let index = 0;
  for (const r of geo.rotors) {
    if (r.role === 'lift' && r.axis === 'z') index += 1;
    parts.push(rotorShape(r, view, map, scale, r.role === 'lift' && r.axis === 'z' ? index : undefined));
  }
  if (view === 'top') parts.push(noseArrow(map, scale, geo.extents.x[1]));
  return parts;
}

/**
 * Draw one orthographic view.
 * @param {object} geo result of computeGeometry()
 * @param {'top'|'front'|'side'} view
 */
export function drawView(geo, view) {
  const bounds = boundsFor(geo, view);
  const { scale, map } = makeTransform(bounds);
  const parts = geo.family === 'multirotor' ? multirotorParts(geo, view, map, scale) : wingedParts(geo, view, map, scale);
  const length = geo.extents.x[1] - geo.extents.x[0];
  const width = geo.extents.y[1] - geo.extents.y[0];
  const description = `${VIEW_LABELS[view]} of the ${geo.layout} layout, ${length.toFixed(2)} m long and ${width.toFixed(2)} m wide overall, drawn to scale.`;
  return s(
    'svg',
    { class: 'view2d', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': description, dataset: { view } },
    s('title', null, description),
    s('g', { class: 'view2d__drawing' }, parts),
    scaleBar(scale),
  );
}
