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

export const WIDGETS = Object.freeze({
  uncertainty: uncertaintyCalculator,
  units: unitConverter,
  isa: isaCalculator,
});
