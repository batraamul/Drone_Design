/**
 * Electrical architecture analysis (Build 3): supply rails, power budget and
 * interface compatibility checks for project.modules.components.
 *
 * Model (docs/engineering-models.md §6):
 *  - A battery supplies the rail [n·V_cell,min, n·V_cell,max] (chemistry table below).
 *  - A regulator, or a flight controller with an output, supplies [V_out, V_out]. A flight
 *    controller whose output is within 0.5 V of its input is treated as a pass-through:
 *    its rail equals its input rail and its downstream current passes through unchanged.
 *  - Consumers draw their worst-case current I (× quantity). A converter draws
 *    I_in = I_q + Σ(V_out · I_load) / (η · V_in,min) from its supply: worst case at the
 *    lowest input voltage.
 *  - ESC current is the user's estimate of operating current (propulsion models in Build 4).
 * Every check states its rule and the numbers that triggered it.
 */
import { CHEMISTRIES, INTERFACE_KINDS, SPEC_FIELDS, canSupply, componentType, interfaceKind } from './components.js';

const PASS_THROUGH_TOLERANCE = 0.5; // V
const DERATING = 0.8; // warn above 80 % of a continuous rating (common practice)
const ASSUMED_FC_EFFICIENCY = 0.85; // on-board regulator of a flight controller, when not pass-through

const KIND_LABEL = Object.fromEntries(INTERFACE_KINDS.map((k) => [k.id, k.label]));

function q(symbol, label, value, unit, displayUnit) {
  return { symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) };
}
const amps = (value) => (Math.abs(value) < 1 ? 'mA' : 'A');

/** Voltage range of the rail a supplier provides, or null. */
function railOf(item, inputRail) {
  if (item.type === 'battery') {
    const chem = CHEMISTRIES[item.specs.chemistry] ?? CHEMISTRIES.lipo;
    return { min: item.specs.cells * chem.min, max: item.specs.cells * chem.max, nominal: item.specs.cells * chem.nominal, passThrough: false };
  }
  const vout = item.specs.outputVoltage;
  if (!(typeof vout === 'number' && vout > 0)) return null;
  if (item.type === 'flight-controller' && inputRail && Math.abs(vout - (inputRail.min + inputRail.max) / 2) <= PASS_THROUGH_TOLERANCE) {
    return { ...inputRail, passThrough: true };
  }
  return { min: vout, max: vout, nominal: vout, passThrough: false };
}

function ratingOf(item) {
  if (item.type === 'battery') return { value: item.specs.maxContinuousCurrent, label: 'rated continuous current' };
  if (typeof item.specs.maxOutputCurrent === 'number') return { value: item.specs.maxOutputCurrent, label: 'rated output current' };
  return null;
}

/**
 * Analyse the component set.
 * @returns {{ rails, loads, checks, derived, totals }}
 */
export function analyseElectrical(components) {
  const items = components?.items ?? [];
  const connections = components?.connections ?? [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const checks = [];
  const derived = [];
  const power = connections.filter((c) => c.kind === 'power' && byId.has(c.from) && byId.has(c.to));
  const suppliersOf = (id) => power.filter((c) => c.to === id).map((c) => byId.get(c.from));
  const consumersOf = (id) => power.filter((c) => c.from === id).map((c) => byId.get(c.to));

  // ---- Rails (resolve upstream first; cycles are reported once) ----------------------------
  const rails = new Map();
  const resolving = new Set();
  let cycle = false;
  const railFor = (item) => {
    if (rails.has(item.id)) return rails.get(item.id);
    if (resolving.has(item.id)) {
      cycle = true;
      return null;
    }
    resolving.add(item.id);
    const upstream = suppliersOf(item.id).map(railFor).filter(Boolean);
    const input = upstream.length ? { min: Math.min(...upstream.map((r) => r.min)), max: Math.max(...upstream.map((r) => r.max)), nominal: upstream[0].nominal } : null;
    const rail = canSupply(item) ? railOf(item, input) : null;
    resolving.delete(item.id);
    rails.set(item.id, rail);
    return rail;
  };
  const inputRailOf = (item) => {
    const up = suppliersOf(item.id).map(railFor).filter(Boolean);
    return up.length ? { min: Math.min(...up.map((r) => r.min)), max: Math.max(...up.map((r) => r.max)), nominal: up[0].nominal } : null;
  };
  items.forEach(railFor);

  // ---- Loads: current each component draws from its supply (worst case) -------------------
  const loads = new Map(); // id → { current, outputLoad }
  const computing = new Set();
  const loadOf = (item) => {
    if (loads.has(item.id)) return loads.get(item.id);
    if (computing.has(item.id)) {
      cycle = true;
      return { current: 0, outputLoad: 0 };
    }
    computing.add(item.id);
    const qty = item.quantity ?? 1;
    let own = 0;
    if (item.type === 'esc') own = (item.specs.loadCurrent ?? 0) * qty;
    else if (item.type !== 'battery') own = (item.specs.supplyCurrent ?? 0) * qty;
    let outputLoad = 0;
    let current = own;
    if (canSupply(item)) {
      outputLoad = consumersOf(item.id).reduce((sum, c) => sum + loadOf(c).current, 0);
      const rail = rails.get(item.id);
      const input = inputRailOf(item);
      if (item.type === 'battery') current = outputLoad;
      else if (rail?.passThrough) current = own + outputLoad;
      else if (rail && outputLoad > 0) {
        const eta = item.type === 'regulator' ? item.specs.efficiency : ASSUMED_FC_EFFICIENCY;
        const vin = input?.min ?? rail.nominal;
        current = own + (rail.nominal * outputLoad) / (eta * vin);
      }
    }
    computing.delete(item.id);
    const result = { current, outputLoad };
    loads.set(item.id, result);
    return result;
  };
  items.forEach(loadOf);

  if (cycle) {
    checks.push({ id: 'AV-PWR-000', severity: 'error', title: 'Power connections form a loop', message: 'Some components supply each other in a loop, so the power budget cannot be resolved. Remove the power connection that points back upstream.', equation: 'Power must flow from sources to consumers without loops', inputs: [], assumptions: [], provenance: 'analytical' });
  }

  // ---- Power checks ------------------------------------------------------------------------
  for (const c of power) {
    const from = byId.get(c.from);
    const to = byId.get(c.to);
    if (!canSupply(from)) {
      checks.push({ id: 'AV-PWR-006', severity: 'error', title: `${from.name} cannot supply power`, message: `${from.name} has no output rail, so it cannot power ${to.name}. Connect ${to.name} to a battery, a regulator or a flight-controller output.`, equation: 'Supplier must be a battery or have an output voltage', inputs: [], assumptions: [], provenance: 'analytical', components: [from.id, to.id] });
      continue;
    }
    const rail = rails.get(from.id);
    const vmin = to.specs.supplyVoltageMin;
    const vmax = to.specs.supplyVoltageMax;
    if (!rail || typeof vmin !== 'number') continue;
    const inputs = [q('V_rail', `${from.name} rail`, rail.max, 'V'), q('V_max', `${to.name} maximum supply`, vmax, 'V'), q('V_min', `${to.name} minimum supply`, vmin, 'V')];
    if (rail.max > vmax + 1e-9) {
      checks.push({ id: 'AV-PWR-001', severity: 'error', title: `Over-voltage: ${to.name}`, message: `${from.name} can supply up to ${rail.max.toFixed(2)} V, above the ${vmax.toFixed(2)} V that ${to.name} accepts. It may be damaged. Feed it from a regulator with a suitable output.`, equation: 'Required: V_rail,max ≤ V_supply,max', inputs, result: q('V_rail,max', 'Highest rail voltage', rail.max, 'V'), assumptions: from.type === 'battery' ? ['Battery at full charge.'] : [], provenance: 'analytical', components: [from.id, to.id] });
    }
    if (rail.min < vmin - 1e-9) {
      checks.push({ id: 'AV-PWR-002', severity: 'warning', title: `Under-voltage possible: ${to.name}`, message: `${from.name} can drop to ${rail.min.toFixed(2)} V, below the ${vmin.toFixed(2)} V that ${to.name} needs. It may reset or brown out${from.type === 'battery' ? ' as the battery empties' : ''}.`, equation: 'Required: V_rail,min ≥ V_supply,min', inputs: [q('V_rail,min', `${from.name} lowest voltage`, rail.min, 'V'), q('V_min', `${to.name} minimum supply`, vmin, 'V')], result: q('V_rail,min', 'Lowest rail voltage', rail.min, 'V'), assumptions: from.type === 'battery' ? [`Battery at its minimum loaded cell voltage (${(CHEMISTRIES[from.specs.chemistry] ?? CHEMISTRIES.lipo).min} V per cell).`] : [], provenance: 'analytical', components: [from.id, to.id] });
    }
  }

  const railRows = [];
  for (const item of items) {
    if (!canSupply(item)) continue;
    const rail = rails.get(item.id);
    const { current, outputLoad } = loads.get(item.id);
    const load = item.type === 'battery' ? current : outputLoad;
    const rating = ratingOf(item);
    const consumers = consumersOf(item.id);
    railRows.push({ id: item.id, name: item.name, rail, load, rating: rating?.value ?? null, utilisation: rating?.value ? load / rating.value : null, consumers: consumers.map((c) => c.id) });
    if (!rating || !consumers.length) continue;
    const inputs = [q('I_load', 'Load current', load, 'A', amps(load)), q('I_rated', rating.label, rating.value, 'A', amps(rating.value))];
    if (load > rating.value + 1e-9) {
      checks.push({ id: 'AV-PWR-003', severity: 'error', title: `${item.name} is overloaded`, message: `The components on this ${item.type === 'battery' ? 'battery' : 'rail'} draw up to ${load.toFixed(2)} A, more than its ${rating.label} of ${rating.value} A. Use a larger ${item.type === 'battery' ? 'battery' : 'regulator'} or move loads to another supply.`, equation: 'Required: I_load ≤ I_rated', inputs, result: q('I_load/I_rated', 'Utilisation', load / rating.value, '1'), assumptions: ['Every consumer at its worst-case current at the same time.'], provenance: 'analytical', components: [item.id] });
    } else if (load > DERATING * rating.value) {
      checks.push({ id: 'AV-PWR-004', severity: 'warning', title: `${item.name} has little margin`, message: `The load is ${((load / rating.value) * 100).toFixed(0)} % of the ${rating.label}. Keeping continuous loads below about 80 % leaves margin for heat, ageing and current peaks.`, equation: 'Guideline: I_load ≤ 0.8 I_rated', inputs, result: q('I_load/I_rated', 'Utilisation', load / rating.value, '1'), assumptions: ['80 % derating is a common design practice, not a hard limit.'], provenance: 'conceptual-estimate', components: [item.id] });
    }
  }

  for (const item of items) {
    if (item.type === 'battery') continue;
    const supplies = suppliersOf(item.id);
    if (!supplies.length) {
      checks.push({ id: 'AV-PWR-005', severity: 'warning', title: `${item.name} has no power supply`, message: `Connect ${item.name} to a battery, regulator or flight-controller output, so that it is included in the power budget.`, equation: 'Each consumer needs a power connection', inputs: [], assumptions: [], provenance: 'analytical', components: [item.id] });
    } else if (supplies.length > 1) {
      checks.push({ id: 'AV-PWR-008', severity: 'info', title: `${item.name} has ${supplies.length} power supplies`, message: 'Redundant supplies need diodes or an ideal-diode controller so that the sources do not back-feed each other. The budget counts the full load on each supply (conservative).', equation: '', inputs: [], assumptions: [], provenance: 'analytical', components: [item.id] });
    }
    if (item.type === 'esc' && item.specs.loadCurrent === null) {
      checks.push({ id: 'AV-PWR-007', severity: 'info', title: `Propulsion current not included for ${item.name}`, message: 'Enter an estimate of the operating current per ESC to include the motors in the battery budget. The propulsion models of Build 4 will replace this estimate.', equation: '', inputs: [], assumptions: [], provenance: 'analytical', components: [item.id] });
    }
  }

  // ---- Interface checks --------------------------------------------------------------------
  const signal = connections.filter((c) => c.kind !== 'power' && byId.has(c.from) && byId.has(c.to));
  for (const c of signal) {
    const from = byId.get(c.from);
    const to = byId.get(c.to);
    for (const end of [from, to]) {
      if (!(end.interfaces?.[c.kind] > 0)) {
        checks.push({ id: 'AV-IF-001', severity: 'error', title: `${end.name} has no ${KIND_LABEL[c.kind]} port`, message: `The ${KIND_LABEL[c.kind]} connection between ${from.name} and ${to.name} needs a ${KIND_LABEL[c.kind]} port on both ends. Use another interface, or set the port count if the component has one.`, equation: `Required: ports(${c.kind}) ≥ 1`, inputs: [], assumptions: [], provenance: 'analytical', components: [end.id] });
      }
    }
    const kind = interfaceKind(c.kind);
    if (kind.logic) {
      const lf = from.specs.logicLevel;
      const lt = to.specs.logicLevel;
      if (typeof lf === 'number' && typeof lt === 'number' && lf !== lt) {
        const low = lf < lt ? from : to;
        const high = lf < lt ? to : from;
        if (!low.specs.tolerant5V || high.specs.logicLevel > 5) {
          checks.push({ id: 'AV-IF-003', severity: 'error', title: `Logic-level mismatch: ${high.name} → ${low.name}`, message: `${high.name} drives ${high.specs.logicLevel} V signals into ${low.name}, whose ${low.specs.logicLevel} V inputs are not rated for them. Add a level shifter, or choose parts with matching logic levels.`, equation: 'Required: V_logic,high ≤ V_tolerated,low', inputs: [q('V_high', `${high.name} logic`, high.specs.logicLevel, 'V'), q('V_low', `${low.name} logic`, low.specs.logicLevel, 'V')], result: q('ΔV', 'Mismatch', high.specs.logicLevel - low.specs.logicLevel, 'V'), assumptions: ['Signal levels taken from the declared logic level of each component.'], provenance: 'analytical', components: [from.id, to.id] });
        }
      }
    }
  }
  // Port usage on each component, for point-to-point kinds (a PWM link uses one channel per unit of quantity).
  for (const item of items) {
    for (const kind of INTERFACE_KINDS.filter((k) => k.pointToPoint)) {
      const available = item.interfaces?.[kind.id] ?? 0;
      const used = signal
        .filter((c) => c.kind === kind.id && (c.from === item.id || c.to === item.id))
        .reduce((sum, c) => {
          const other = byId.get(c.from === item.id ? c.to : c.from);
          return sum + (kind.id === 'pwm' ? Math.max(1, (other.quantity ?? 1) / Math.max(1, item.quantity ?? 1)) : 1);
        }, 0);
      if (available > 0 && used > available) {
        checks.push({ id: 'AV-IF-002', severity: 'error', title: `${item.name}: not enough ${kind.label} ports`, message: `${used} ${kind.label} links are connected but only ${available} ${available === 1 ? 'is' : 'are'} available. Move a device to another interface (for example a CAN or I²C bus) or choose a controller with more ports.`, equation: 'Required: ports used ≤ ports available', inputs: [q('n_used', 'Ports used', used, '1'), q('n_avail', 'Ports available', available, '1')], result: q('n_used', 'Ports used', used, '1'), assumptions: [kind.id === 'pwm' ? 'One output channel per ESC or servo.' : 'One port per point-to-point link.'], provenance: 'analytical', components: [item.id] });
      }
    }
  }
  const linked = (item, kinds) => signal.some((c) => (c.from === item.id || c.to === item.id) && (!kinds || kinds.includes(c.kind)));
  for (const item of items) {
    if (item.type === 'esc' && !linked(item, ['pwm', 'can', 'uart'])) {
      checks.push({ id: 'AV-IF-004', severity: 'warning', title: `${item.name} has no control signal`, message: 'Connect the ESC to the flight controller (PWM/DShot output, or CAN or serial if supported).', equation: '', inputs: [], assumptions: [], provenance: 'analytical', components: [item.id] });
    } else if (['receiver', 'telemetry', 'gnss', 'sensor', 'companion'].includes(item.type) && !linked(item)) {
      checks.push({ id: 'AV-IF-004', severity: 'warning', title: `${item.name} is not connected for data`, message: `${item.name} has no data connection, so the flight controller cannot use it. Add a UART, I²C, CAN, USB or Ethernet link.`, equation: '', inputs: [], assumptions: [], provenance: 'analytical', components: [item.id] });
    }
  }

  // ---- Data provenance ------------------------------------------------------------------------
  const unsourced = items.filter((i) => (i.provenance === 'datasheet' || i.provenance === 'measured') && !i.source.trim());
  if (unsourced.length) {
    checks.push({ id: 'AV-DATA-001', severity: 'warning', title: 'Datasheet or measured values without a source', message: `Record the datasheet (document, revision, page) or test reference for: ${unsourced.map((i) => i.name).join(', ')}.`, equation: '', inputs: [], assumptions: [], provenance: 'analytical', components: unsourced.map((i) => i.id) });
  }
  const illustrative = items.filter((i) => i.provenance === 'illustrative');
  if (illustrative.length) {
    checks.push({ id: 'AV-DATA-002', severity: 'info', title: `${illustrative.length} component(s) use illustrative example data`, message: 'Illustrative catalogue values are typical numbers for learning, not data about a real product. Replace them with datasheet values (and a source) before relying on the budget.', equation: '', inputs: [], assumptions: [], provenance: 'illustrative', components: illustrative.map((i) => i.id) });
  }

  // ---- Totals --------------------------------------------------------------------------------
  const mass = items.reduce((sum, i) => sum + (i.specs.mass ?? 0) * (i.quantity ?? 1), 0);
  const batteries = items.filter((i) => i.type === 'battery');
  const batteryCurrent = batteries.reduce((sum, b) => sum + loads.get(b.id).current, 0);
  const batteryPower = batteries.reduce((sum, b) => sum + loads.get(b.id).current * (rails.get(b.id)?.nominal ?? 0), 0);
  const avionicsOnly = batteries.reduce((sum, b) => {
    const escShare = consumersOf(b.id).filter((c) => c.type === 'esc').reduce((s, c) => s + loads.get(c.id).current, 0);
    return sum + (loads.get(b.id).current - escShare) * (rails.get(b.id)?.nominal ?? 0);
  }, 0);
  if (items.length) {
    derived.push({ id: 'av-mass', label: 'Mass of listed components', symbol: 'm_comp', value: mass, unit: 'kg', displayUnit: mass < 1 ? 'g' : 'kg', equation: 'm_comp = Σ quantity × mass', inputs: [], provenance: illustrative.length ? 'illustrative' : 'analytical', note: 'Structure, wiring, propellers and motors are not included yet (Build 4).' });
  }
  if (batteries.length) {
    derived.push({ id: 'av-batt-current', label: 'Battery current (worst case)', symbol: 'I_batt', value: batteryCurrent, unit: 'A', displayUnit: amps(batteryCurrent), equation: 'I_batt = Σ loads referred to the battery', inputs: [], provenance: 'analytical', assumptions: ['Every consumer at its worst-case current at once.', 'Converter input current at the lowest input voltage.'] });
    derived.push({ id: 'av-batt-power', label: 'Power drawn from the battery (at nominal voltage)', symbol: 'P_batt', value: batteryPower, unit: 'W', equation: 'P_batt = Σ I_batt × V_nominal', inputs: [], provenance: 'analytical' });
    derived.push({ id: 'av-avionics-power', label: 'Avionics power (excluding ESCs)', symbol: 'P_av', value: avionicsOnly, unit: 'W', equation: 'P_av = P_batt − P_ESC', inputs: [], provenance: 'analytical' });
    const energy = batteries.reduce((sum, b) => sum + b.specs.capacity * (rails.get(b.id)?.nominal ?? 0), 0);
    if (batteryPower > 0) {
      derived.push({ id: 'av-endurance', label: 'Battery life at this load (no reserve)', symbol: 't', value: energy / batteryPower, unit: 's', displayUnit: 'min', equation: 't = Q V_nom / P_batt', inputs: [q('E', 'Stored energy', energy, 'J', 'Wh'), q('P_batt', 'Battery power', batteryPower, 'W')], provenance: 'analytical', assumptions: ['Constant load and 100 % usable capacity; real packs deliver less (temperature, ageing, cut-off).', items.some((i) => i.type === 'esc' && i.specs.loadCurrent !== null) ? 'Includes your ESC current estimates.' : 'Excludes propulsion: this is how long the avionics alone would run.'] });
    }
  }

  const order = { error: 0, warning: 1, info: 2 };
  checks.sort((a, b) => order[a.severity] - order[b.severity]);
  return { rails: railRows, loads, checks, derived, totals: { mass, batteryCurrent, batteryPower, avionicsPower: avionicsOnly } };
}

export const SPEC_LABEL = (key) => SPEC_FIELDS[key]?.label ?? key;
export const typeLabel = (type) => componentType(type)?.label ?? type;
