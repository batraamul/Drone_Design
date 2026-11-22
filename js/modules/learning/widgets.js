/**
 * Interactive calculators embedded in lessons. Each is a real, tested model call;
 * none of them fabricates data.
 */
import { h } from '../../utils/dom.js';
import { field, formatForInput, parseNumber, provenanceBadge, selectControl, nextId } from '../../ui/components.js';
import { DIMENSIONS, convert, toSI, fromSI, unitsFor } from '../../engineering/units.js';
import { isa, densityAltitude, MIN_ALTITUDE, MAX_ALTITUDE } from '../../engineering/atmosphere.js';
import { formatNumber } from '../../utils/format.js';
import { lineChart } from '../../visualisation/plots.js';
import { wingPlanform } from '../../engineering/geometry.js';
import { G0 } from '../../engineering/atmosphere.js';

const n = (value, digits = 5) => formatNumber(value, { digits });

function numberInput({ id, value, onInput, label, unit }) {
  const input = h('input', { id, class: 'input input--number', type: 'text', inputmode: 'decimal', value: String(value), autocomplete: 'off', 'aria-label': label });
  input.addEventListener('input', () => onInput(input.value));
  return unit ? h('div', { class: 'quantity' }, input, h('span', { class: 'quantity__unit' }, unit)) : input;
}

function resultTable(rows, caption) {
  return h(
    'table',
    { class: 'table table--compact result-table' },
    h('caption', { class: 'visually-hidden' }, caption),
    h('tbody', null, rows.map(([label, value, note]) => h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'mono' }, value), note ? h('td', { class: 'muted' }, note) : h('td')))),
  );
}

// ---- Uncertainty propagation ------------------------------------------------------------

function uncertaintyCalculator() {
  const state = { energy: '100', energyU: '5', power: '400', powerU: '10' };
  const output = h('div', { class: 'calc__output', 'aria-live': 'polite' });
  const ids = { e: nextId('u'), eu: nextId('u'), p: nextId('u'), pu: nextId('u') };
  const update = () => {
    const values = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, parseNumber(v)]));
    const bad = Object.entries(values).find(([, v]) => v.error || v.value === null || v.value < 0);
    if (bad || values.power.value === 0) {
      output.replaceChildren(h('p', { class: 'field__error' }, 'Enter non-negative numbers (power must be above zero).'));
      return;
    }
    const energyJ = toSI(values.energy.value, 'Wh');
    const t = energyJ / values.power.value;
    const rel = Math.sqrt((values.energyU.value / 100) ** 2 + (values.powerU.value / 100) ** 2);
    output.replaceChildren(
      resultTable(
        [
          ['Endurance t = E / P', `${n(fromSI(t, 'min'), 4)} min`, provenanceBadge('analytical')],
          ['Relative uncertainty', `± ${n(rel * 100, 3)} %`, '√[(u_E/E)² + (u_P/P)²]'],
          ['Absolute uncertainty', `± ${n(fromSI(t * rel, 'min'), 3)} min`, 'one standard uncertainty'],
        ],
        'Uncertainty calculation result',
      ),
    );
  };
  const make = (key, id, label, unit) => field({ id, label, control: numberInput({ id, value: state[key], label, unit, onInput: (v) => { state[key] = v; update(); } }) });
  update();
  return h(
    'div',
    { class: 'calc' },
    h('div', { class: 'calc__inputs' }, make('energy', ids.e, 'Usable energy E', 'Wh'), make('energyU', ids.eu, 'Uncertainty of E', '%'), make('power', ids.p, 'Average power P', 'W'), make('powerU', ids.pu, 'Uncertainty of P', '%')),
    output,
    h('p', { class: 'calc__note' }, 'Assumes constant power and independent input uncertainties (first-order propagation).'),
  );
}

// ---- Unit converter ------------------------------------------------------------------------

function unitConverter() {
  const dimensions = Object.entries(DIMENSIONS).filter(([key]) => key !== 'dimensionless');
  const state = { dimension: 'energy', value: '74', from: 'Wh', to: 'J', capacity: '5000', voltage: '14.8' };
  const output = h('p', { class: 'calc__result mono', 'aria-live': 'polite' });
  const batteryOutput = h('div', { class: 'calc__output', 'aria-live': 'polite' });
  const fromId = nextId('cv');
  const toId = nextId('cv');
  const dimId = nextId('cv');
  const valueId = nextId('cv');
  let fromSelect;
  let toSelect;
  const unitOptions = () => unitsFor(state.dimension).map((u) => ({ value: u, label: u }));
  const rebuildSelects = () => {
    const units = unitsFor(state.dimension);
    if (!units.includes(state.from)) state.from = units[0];
    if (!units.includes(state.to)) state.to = units[1] ?? units[0];
    fromSelect.replaceWith((fromSelect = selectControl({ id: fromId, options: unitOptions(), value: state.from, onChange: (v) => { state.from = v; update(); } })));
    toSelect.replaceWith((toSelect = selectControl({ id: toId, options: unitOptions(), value: state.to, onChange: (v) => { state.to = v; update(); } })));
  };
  const update = () => {
    const parsed = parseNumber(state.value);
    if (parsed.error || parsed.value === null) {
      output.textContent = parsed.error ?? 'Enter a value to convert.';
    } else {
      const result = convert(parsed.value, state.from, state.to);
      output.textContent = `${formatForInput(parsed.value)} ${state.from} = ${n(result, 7)} ${state.to}`;
    }
    const q = parseNumber(state.capacity);
    const v = parseNumber(state.voltage);
    if (q.error || v.error || q.value === null || v.value === null || q.value < 0 || v.value < 0) {
      batteryOutput.replaceChildren(h('p', { class: 'field__error' }, 'Enter a non-negative capacity and voltage.'));
    } else {
      const energy = toSI(q.value, 'mAh') * v.value;
      batteryOutput.replaceChildren(
        resultTable(
          [
            ['Charge Q', `${n(toSI(q.value, 'mAh'), 6)} C`, `${n(q.value / 1000, 5)} Ah`],
            ['Nominal energy E = Q·V', `${n(fromSI(energy, 'Wh'), 5)} Wh`, `${n(energy / 1000, 5)} kJ`],
          ],
          'Battery energy result',
        ),
      );
    }
  };
  fromSelect = selectControl({ id: fromId, options: unitOptions(), value: state.from, onChange: (value) => { state.from = value; update(); } });
  toSelect = selectControl({ id: toId, options: unitOptions(), value: state.to, onChange: (value) => { state.to = value; update(); } });
  const dimensionSelect = selectControl({
    id: dimId,
    options: dimensions.map(([key, def]) => ({ value: key, label: def.label })),
    value: state.dimension,
    onChange: (value) => {
      state.dimension = value;
      rebuildSelects();
      update();
    },
  });
  const valueInput = numberInput({ id: valueId, value: state.value, label: 'Value to convert', onInput: (v) => { state.value = v; update(); } });
  const capId = nextId('cv');
  const voltId = nextId('cv');
  update();
  return h(
    'div',
    { class: 'calc' },
    h('h4', { class: 'calc__heading' }, 'Unit converter'),
    h('div', { class: 'calc__inputs' }, field({ id: dimId, label: 'Quantity', control: dimensionSelect }), field({ id: valueId, label: 'Value', control: valueInput }), field({ id: fromId, label: 'From', control: fromSelect }), field({ id: toId, label: 'To', control: toSelect })),
    output,
    h('h4', { class: 'calc__heading' }, 'Battery nominal energy'),
    h(
      'div',
      { class: 'calc__inputs' },
      field({ id: capId, label: 'Capacity', control: numberInput({ id: capId, value: state.capacity, label: 'Capacity', unit: 'mAh', onInput: (v) => { state.capacity = v; update(); } }) }),
      field({ id: voltId, label: 'Nominal voltage', control: numberInput({ id: voltId, value: state.voltage, label: 'Nominal voltage', unit: 'V', onInput: (v) => { state.voltage = v; update(); } }) }),
    ),
    batteryOutput,
    h('p', { class: 'calc__note' }, 'Nominal energy only: voltage sag, temperature, ageing and reserve are not included.'),
  );
}

// ---- ISA calculator ----------------------------------------------------------------------

function isaProfiles(maxAltitude) {
  const points = [];
  const top = Math.min(maxAltitude, MAX_ALTITUDE);
  for (let i = 0; i <= 80; i += 1) {
    const z = (top * i) / 80;
    points.push({ z, air: isa(z) });
  }
  return points;
}

function isaCalculator() {
  const state = { altitude: '1500', unit: 'm', mode: 'geometric', deltaT: '0' };
  const altitudeId = nextId('isa');
  const unitId = nextId('isa');
  const modeId = nextId('isa');
  const deltaId = nextId('isa');
  const output = h('div', { class: 'calc__output', 'aria-live': 'polite' });
  const charts = h('div', { class: 'chart-row' });
  const update = () => {
    const altitude = parseNumber(state.altitude);
    const deltaT = parseNumber(state.deltaT);
    if (altitude.error || altitude.value === null || deltaT.error) {
      output.replaceChildren(h('p', { class: 'field__error' }, altitude.error ?? deltaT.error ?? 'Enter an altitude.'));
      charts.replaceChildren();
      return;
    }
    let air;
    try {
      air = isa(toSI(altitude.value, state.unit), { geopotential: state.mode === 'geopotential', deltaT: deltaT.value ?? 0 });
    } catch (error) {
      output.replaceChildren(h('p', { class: 'field__error' }, error.message));
      charts.replaceChildren();
      return;
    }
    let densityAlt = '—';
    try {
      densityAlt = `${n(densityAltitude(air.density), 5)} m`;
    } catch {
      densityAlt = 'outside troposphere';
    }
    output.replaceChildren(
      h('p', { class: 'calc__meta' }, provenanceBadge('analytical'), ` ${air.layer} · geometric ${n(air.altitude, 6)} m · geopotential ${n(air.geopotentialAltitude, 6)} m`),
      resultTable(
        [
          ['Temperature T', `${n(air.temperature, 6)} K`, `${n(air.temperature - 273.15, 4)} °C`],
          ['Pressure p', `${n(air.pressure, 6)} Pa`, `${n(air.pressure / 100, 6)} hPa`],
          ['Density ρ', `${n(air.density, 5)} kg/m³`, `σ = ${n(air.densityRatio, 4)}`],
          ['Pressure ratio δ', n(air.pressureRatio, 5), 'p / p₀'],
          ['Temperature ratio θ', n(air.temperatureRatio, 5), 'T / T₀'],
          ['Speed of sound a', `${n(air.speedOfSound, 5)} m/s`, '√(γRT)'],
          ['Dynamic viscosity μ', `${n(air.dynamicViscosity, 5)} Pa·s`, 'Sutherland'],
          ['Kinematic viscosity ν', `${n(air.kinematicViscosity, 5)} m²/s`, 'μ / ρ'],
          ['Density altitude', densityAlt, 'ISA altitude with the same ρ'],
        ],
        'Standard atmosphere results',
      ),
    );
    const topAltitude = Math.max(12000, Math.min(MAX_ALTITUDE, Math.ceil((air.altitude * 1.5) / 4000) * 4000));
    const profile = isaProfiles(topAltitude);
    const km = (z) => z / 1000;
    charts.replaceChildren(
      lineChart({
        points: profile.map((p) => [p.air.temperature, km(p.z)]),
        marker: [air.temperature - (deltaT.value ?? 0), km(air.altitude)],
        title: 'ISA temperature',
        description: `Standard temperature profile from 0 to ${km(topAltitude)} km; marker at the selected altitude.`,
        xLabel: 'Temperature (K)',
        yLabel: 'Altitude (km)',
      }),
      lineChart({
        points: profile.map((p) => [p.air.density, km(p.z)]),
        marker: [isa(air.altitude).density, km(air.altitude)],
        title: 'ISA density',
        description: `Standard density profile from 0 to ${km(topAltitude)} km; marker at the selected altitude (ΔT = 0).`,
        xLabel: 'Density (kg/m³)',
        yLabel: 'Altitude (km)',
        tone: 'secondary',
      }),
    );
  };
  const altitudeInput = numberInput({ id: altitudeId, value: state.altitude, label: 'Altitude', onInput: (v) => { state.altitude = v; update(); } });
  const unitSelect = selectControl({ id: unitId, options: ['m', 'km', 'ft'].map((u) => ({ value: u, label: u })), value: state.unit, onChange: (v) => { state.unit = v; update(); } });
  const modeSelect = selectControl({
    id: modeId,
    options: [
      { value: 'geometric', label: 'Geometric (AMSL)' },
      { value: 'geopotential', label: 'Geopotential' },
    ],
    value: state.mode,
    onChange: (v) => {
      state.mode = v;
      update();
    },
  });
  const deltaInput = numberInput({ id: deltaId, value: state.deltaT, label: 'Temperature deviation', unit: 'K', onInput: (v) => { state.deltaT = v; update(); } });
  update();
  return h(
    'div',
    { class: 'calc' },
    h(
      'div',
      { class: 'calc__inputs' },
      field({ id: altitudeId, label: 'Altitude', control: altitudeInput, hint: `${MIN_ALTITUDE} m to ${Math.round(MAX_ALTITUDE)} m` }),
      field({ id: unitId, label: 'Unit', control: unitSelect }),
      field({ id: modeId, label: 'Altitude type', control: modeSelect }),
      field({ id: deltaId, label: 'ISA deviation ΔT', control: deltaInput, hint: 'At pressure altitude' }),
    ),
    output,
    charts,
  );
}

// ---- Multirotor hover (momentum theory) -------------------------------------------------

function hoverCalculator() {
  const state = { mass: '1.5', rotors: '4', diameter: '10', arm: '225', altitude: '0' };
  const ids = Object.fromEntries(Object.keys(state).map((k) => [k, nextId('hv')]));
  const output = h('div', { class: 'calc__output', 'aria-live': 'polite' });
  const charts = h('div', { class: 'chart-row' });
  const update = () => {
    const v = Object.fromEntries(Object.entries(state).map(([k, x]) => [k, parseNumber(x)]));
    const rotors = v.rotors.value;
    if (Object.values(v).some((x) => x.error || x.value === null) || v.mass.value <= 0 || v.diameter.value <= 0 || v.arm.value <= 0 || !Number.isInteger(rotors) || rotors < 3 || rotors > 12 || v.altitude.value < MIN_ALTITUDE || v.altitude.value > 20000) {
      output.replaceChildren(h('p', { class: 'field__error' }, 'Enter a positive mass, diameter and arm length, 3–12 rotors (whole number) and an altitude between −5 000 and 20 000 m.'));
      charts.replaceChildren();
      return;
    }
    const D = toSI(v.diameter.value, 'in');
    const R = toSI(v.arm.value, 'mm');
    const rho = isa(v.altitude.value).density;
    const W = v.mass.value * G0;
    const A = (rotors * Math.PI * D * D) / 4;
    const s = 2 * R * Math.sin(Math.PI / rotors);
    const power = (area) => W * Math.sqrt(W / (2 * rho * area));
    output.replaceChildren(
      resultTable(
        [
          ['Axis spacing s = 2R sin(π/n)', `${n(s * 1000, 4)} mm`, ''],
          ['Tip clearance s − D', `${n((s - D) * 1000, 4)} mm`, s - D < 0 ? 'Propellers overlap!' : s - D < 0.1 * D ? 'Below 10 % of D' : 'OK'],
          ['Total disc area A', `${n(A, 4)} m²`, provenanceBadge('analytical')],
          ['Disc loading DL', `${n(W / A, 4)} Pa`, 'm g₀ / A'],
          ['Air density ρ (ISA)', `${n(rho, 4)} kg/m³`, `at ${v.altitude.value} m`],
          ['Ideal induced velocity v_h', `${n(Math.sqrt(W / A / (2 * rho)), 4)} m/s`, '√(DL / 2ρ)'],
          ['Ideal hover power', `${n(power(A), 4)} W`, 'lower bound (figure of merit = 1)'],
        ],
        'Hover calculation result',
      ),
    );
    const points = [];
    for (let d = 5; d <= 32; d += 0.5) points.push([d, power((rotors * Math.PI * toSI(d, 'in') ** 2) / 4)]);
    charts.replaceChildren(
      lineChart({
        points,
        marker: [v.diameter.value, power(A)],
        title: 'Ideal hover power vs propeller diameter',
        description: `Ideal hover power for ${v.mass.value} kg on ${rotors} rotors, propeller diameter 5–32 in; marker at the chosen diameter.`,
        xLabel: 'Propeller diameter (in)',
        yLabel: 'Ideal power (W)',
      }),
    );
  };
  const make = (key, label, unit) => field({ id: ids[key], label, control: numberInput({ id: ids[key], value: state[key], label, unit, onInput: (x) => { state[key] = x; update(); } }) });
  update();
  return h(
    'div',
    { class: 'calc' },
    h('div', { class: 'calc__inputs' }, make('mass', 'Take-off mass m', 'kg'), make('rotors', 'Number of rotors n', ''), make('diameter', 'Propeller diameter D', 'in'), make('arm', 'Rotor distance from centre R', 'mm'), make('altitude', 'Altitude (ISA)', 'm')),
    output,
    charts,
    h('p', { class: 'calc__note' }, 'Ideal momentum theory on a regular ring of rotors, one rotor per axis. Real rotors need more power; see the lesson text.'),
  );
}

// ---- Wing planform and tail volume ------------------------------------------------------

function planformCalculator() {
  const state = { span: '2', root: '0.3', taper: '0.6', sweep: '0', sh: '0.096', sv: '0.045', arm: '0.8' };
  const ids = Object.fromEntries(Object.keys(state).map((k) => [k, nextId('pf')]));
  const output = h('div', { class: 'calc__output', 'aria-live': 'polite' });
  const update = () => {
    const v = Object.fromEntries(Object.entries(state).map(([k, x]) => [k, parseNumber(x)]));
    if (Object.values(v).some((x) => x.error || x.value === null) || v.span.value <= 0 || v.root.value <= 0 || v.taper.value <= 0 || v.taper.value > 1.5 || Math.abs(v.sweep.value) >= 80 || v.sh.value < 0 || v.sv.value < 0 || v.arm.value <= 0) {
      output.replaceChildren(h('p', { class: 'field__error' }, 'Enter positive dimensions, a taper ratio up to 1.5 and a sweep below 80°.'));
      return;
    }
    const wp = wingPlanform({ span: v.span.value, rootChord: v.root.value, taperRatio: v.taper.value, sweepLE: toSI(v.sweep.value, 'deg') });
    const VH = (v.sh.value * v.arm.value) / (wp.area * wp.mac);
    const VV = (v.sv.value * v.arm.value) / (wp.area * v.span.value);
    output.replaceChildren(
      resultTable(
        [
          ['Wing area S', `${n(wp.area, 4)} m²`, provenanceBadge('analytical')],
          ['Aspect ratio AR', n(wp.aspectRatio, 4), 'b² / S'],
          ['Mean aerodynamic chord c̄', `${n(wp.mac, 4)} m`, `at ȳ = ${n(wp.yMac, 4)} m`],
          ['Quarter-chord sweep', `${n(fromSI(wp.sweepQC, 'deg'), 4)}°`, ''],
          ['Horizontal tail volume V_H', n(VH, 3), VH < 0.4 ? 'Below the typical 0.4–0.7' : VH > 0.7 ? 'Above the typical 0.4–0.7' : 'Typical'],
          ['Vertical tail volume V_V', n(VV, 3), VV < 0.02 ? 'Below the typical 0.02–0.05' : VV > 0.05 ? 'Above the typical 0.02–0.05' : 'Typical'],
        ],
        'Planform calculation result',
      ),
    );
  };
  const make = (key, label, unit) => field({ id: ids[key], label, control: numberInput({ id: ids[key], value: state[key], label, unit, onInput: (x) => { state[key] = x; update(); } }) });
  update();
  return h(
    'div',
    { class: 'calc' },
    h('div', { class: 'calc__inputs' }, make('span', 'Span b', 'm'), make('root', 'Root chord c_r', 'm'), make('taper', 'Taper ratio λ', ''), make('sweep', 'Leading-edge sweep', '°'), make('sh', 'Horizontal tail area S_h', 'm²'), make('sv', 'Vertical tail area S_v', 'm²'), make('arm', 'Tail arm l_t', 'm')),
    output,
    h('p', { class: 'calc__note' }, 'Typical ranges from conceptual-design statistics (Raymer, table 6.4): guidance, not stability proof.'),
  );
}

export const WIDGETS = Object.freeze({
  uncertainty: uncertaintyCalculator,
  units: unitConverter,
  isa: isaCalculator,
  hover: hoverCalculator,
  planform: planformCalculator,
});
