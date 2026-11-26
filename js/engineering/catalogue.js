/**
 * Built-in component catalogue (Build 3).
 *
 * ILLUSTRATIVE ENTRIES ONLY. They describe typical classes of hobby and research UAV
 * parts with round, plausible numbers so the tools can be learned and tried. They are
 * not real products and must not be used as datasheet values. Replace them with your
 * own components (provenance "datasheet" plus a source reference) before relying on
 * any result. Units: SI (V, A, C, kg, Hz, W).
 */
const mAh = 3.6; // coulombs per mAh

export const CATALOGUE = Object.freeze([
  // ---- Power --------------------------------------------------------------------------
  { catalogueId: 'ill-bat-2s-450', type: 'battery', name: 'Example 2S 450 mAh LiPo', summary: 'Micro quadcopter pack.', specs: { chemistry: 'lipo', cells: 2, capacity: 450 * mAh, maxContinuousCurrent: 36, mass: 0.026 } },
  { catalogueId: 'ill-bat-3s-2200', type: 'battery', name: 'Example 3S 2200 mAh LiPo', summary: 'Small fixed-wing or 5-inch class pack.', specs: { chemistry: 'lipo', cells: 3, capacity: 2200 * mAh, maxContinuousCurrent: 55, mass: 0.19 } },
  { catalogueId: 'ill-bat-4s-5000', type: 'battery', name: 'Example 4S 5000 mAh LiPo', summary: 'Typical pack for a 450–650 mm quadcopter.', specs: { chemistry: 'lipo', cells: 4, capacity: 5000 * mAh, maxContinuousCurrent: 100, mass: 0.55 } },
  { catalogueId: 'ill-bat-6s-10000', type: 'battery', name: 'Example 6S 10 000 mAh Li-ion', summary: 'High-energy pack for long-endurance hexacopters and VTOL.', specs: { chemistry: 'liion', cells: 6, capacity: 10000 * mAh, maxContinuousCurrent: 40, mass: 1.2 } },
  { catalogueId: 'ill-pm-5v-3a', type: 'regulator', name: 'Example power module 5.3 V / 3 A', summary: 'Supplies the flight controller from a 2–6S battery; usually also measures battery voltage and current.', specs: { supplyVoltageMin: 7, supplyVoltageMax: 26, outputVoltage: 5.3, maxOutputCurrent: 3, efficiency: 0.9, supplyCurrent: 0.01, mass: 0.02 }, interfaces: { i2c: 0 } },
  { catalogueId: 'ill-bec-12v-5a', type: 'regulator', name: 'Example 12 V / 5 A regulator', summary: 'Separate rail for a camera or companion-computer payload.', specs: { supplyVoltageMin: 14, supplyVoltageMax: 51, outputVoltage: 12, maxOutputCurrent: 5, efficiency: 0.92, supplyCurrent: 0.015, mass: 0.03 } },
  { catalogueId: 'ill-bec-5v-8a', type: 'regulator', name: 'Example 5 V / 8 A regulator', summary: 'High-current 5 V rail for a companion computer and peripherals.', specs: { supplyVoltageMin: 7, supplyVoltageMax: 36, outputVoltage: 5.1, maxOutputCurrent: 8, efficiency: 0.9, supplyCurrent: 0.015, mass: 0.025 } },

  // ---- Flight control -----------------------------------------------------------------
  { catalogueId: 'ill-fc-h7', type: 'flight-controller', name: 'Example H7-class flight controller', summary: '32-bit autopilot with many serial ports and CAN; powered at 5 V from a power module, which it passes to its peripheral ports.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.3, logicLevel: 3.3, tolerant5V: false, outputVoltage: 5.3, maxOutputCurrent: 2, mass: 0.04 }, interfaces: { uart: 7, i2c: 2, spi: 1, can: 2, pwm: 12, usb: 1, ethernet: 0 } },
  { catalogueId: 'ill-fc-f4', type: 'flight-controller', name: 'Example F4-class flight controller with BEC', summary: 'Compact controller that runs directly from a 2–6S battery and has an on-board 5 V regulator.', specs: { supplyVoltageMin: 7, supplyVoltageMax: 26, supplyCurrent: 0.15, logicLevel: 3.3, tolerant5V: false, outputVoltage: 5, maxOutputCurrent: 2, mass: 0.008 }, interfaces: { uart: 5, i2c: 1, spi: 0, can: 0, pwm: 8, usb: 1, ethernet: 0 } },
  { catalogueId: 'ill-cc-arm', type: 'companion', name: 'Example quad-core ARM companion computer', summary: 'On-board computer for vision, logging and mission logic, connected to the autopilot by UART or Ethernet.', specs: { supplyVoltageMin: 4.75, supplyVoltageMax: 5.25, supplyCurrent: 3, logicLevel: 3.3, tolerant5V: false, mass: 0.05 }, interfaces: { uart: 2, i2c: 1, spi: 1, usb: 4, ethernet: 1, can: 0 } },

  { catalogueId: 'ill-fc-aio-micro', type: 'flight-controller', name: 'Example AIO micro flight controller (1–2S)', summary: 'Tiny all-in-one controller for micro quadcopters, powered directly from a 1–2S pack, with a small 5 V output.', specs: { supplyVoltageMin: 3.3, supplyVoltageMax: 8.7, supplyCurrent: 0.12, logicLevel: 3.3, tolerant5V: false, outputVoltage: 5, maxOutputCurrent: 0.5, mass: 0.004 }, interfaces: { uart: 2, i2c: 0, spi: 0, can: 0, pwm: 4, usb: 1, ethernet: 0 } },

  // ---- Propulsion electronics -----------------------------------------------------------
  { catalogueId: 'ill-esc-5a-micro', type: 'esc', name: 'Example 5 A micro ESC (1–2S)', summary: 'Micro ESC for 1104-class motors.', specs: { supplyVoltageMin: 3, supplyVoltageMax: 8.7, maxContinuousCurrent: 5, loadCurrent: null, logicLevel: 3.3, tolerant5V: true, mass: 0.002 }, interfaces: { pwm: 1, uart: 0, can: 0 } },
  { catalogueId: 'ill-esc-40a', type: 'esc', name: 'Example 40 A ESC (2–6S)', summary: 'One ESC per motor; accepts PWM or DShot from the flight controller.', specs: { supplyVoltageMin: 7, supplyVoltageMax: 26, maxContinuousCurrent: 40, loadCurrent: null, logicLevel: 3.3, tolerant5V: true, mass: 0.03 }, interfaces: { pwm: 1, uart: 0, can: 0 } },
  { catalogueId: 'ill-esc-80a-can', type: 'esc', name: 'Example 80 A CAN ESC (6–14S)', summary: 'High-voltage ESC for heavy-lift multirotors, controllable over CAN.', specs: { supplyVoltageMin: 22, supplyVoltageMax: 60, maxContinuousCurrent: 80, loadCurrent: null, logicLevel: 3.3, tolerant5V: true, mass: 0.11 }, interfaces: { pwm: 1, uart: 0, can: 1 } },

  // ---- Links ------------------------------------------------------------------------
  { catalogueId: 'ill-rx-serial', type: 'receiver', name: 'Example serial RC receiver', summary: 'Long-range RC receiver with a serial (UART) output to the flight controller.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.12, logicLevel: 3.3, tolerant5V: false, mass: 0.005 }, interfaces: { uart: 1, pwm: 0 } },
  { catalogueId: 'ill-tel-sub1ghz', type: 'telemetry', name: 'Example sub-GHz telemetry radio', summary: 'MAVLink telemetry link to the ground station. Check the bands and power allowed in your country before use.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.5, logicLevel: 3.3, tolerant5V: false, frequency: 866e6, txPower: 0.1, mass: 0.02 }, interfaces: { uart: 1, usb: 0, ethernet: 0 } },
  { catalogueId: 'ill-tel-ip-mesh', type: 'telemetry', name: 'Example IP mesh radio (2.4 GHz)', summary: 'Ethernet radio for video and telemetry to a ground network.', specs: { supplyVoltageMin: 9, supplyVoltageMax: 28, supplyCurrent: 0.8, logicLevel: 3.3, tolerant5V: false, frequency: 2.45e9, txPower: 0.5, mass: 0.06 }, interfaces: { uart: 0, usb: 0, ethernet: 1 } },

  // ---- Sensors ------------------------------------------------------------------------
  { catalogueId: 'ill-gnss-compass', type: 'gnss', name: 'Example multi-band GNSS with compass', summary: 'GNSS receiver on UART with a magnetometer on I²C, usually on a mast away from power wiring.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.15, logicLevel: 3.3, tolerant5V: false, mass: 0.03 }, interfaces: { uart: 1, i2c: 1, can: 0 } },
  { catalogueId: 'ill-airspeed-i2c', type: 'sensor', name: 'Example differential-pressure airspeed sensor', summary: 'Pitot-static airspeed sensor on I²C, for fixed-wing and VTOL aircraft.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.01, logicLevel: 3.3, tolerant5V: false, mass: 0.006 }, interfaces: { uart: 0, i2c: 1, spi: 0, can: 0 } },
  { catalogueId: 'ill-rangefinder', type: 'sensor', name: 'Example laser rangefinder', summary: 'Downward-looking distance sensor for terrain following and landing.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.1, logicLevel: 3.3, tolerant5V: false, mass: 0.01 }, interfaces: { uart: 1, i2c: 1, spi: 0, can: 0 } },
  { catalogueId: 'ill-sensor-5v-i2c', type: 'sensor', name: 'Example 5 V-logic I²C sensor', summary: 'Older sensor with 5 V logic: it needs a level shifter on a 3.3 V flight controller. Included to show the logic-level check.', specs: { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.02, logicLevel: 5, tolerant5V: true, mass: 0.005 }, interfaces: { uart: 0, i2c: 1, spi: 0, can: 0 } },

  // ---- Payloads -----------------------------------------------------------------------
  { catalogueId: 'ill-cam-12v', type: 'payload', name: 'Example 12 V mapping camera', summary: 'Survey camera triggered by the autopilot and recording to its own storage.', specs: { supplyVoltageMin: 10, supplyVoltageMax: 14, supplyCurrent: 0.8, logicLevel: 3.3, tolerant5V: true, mass: 0.25 }, interfaces: { uart: 0, i2c: 0, usb: 1, ethernet: 0, pwm: 1, can: 0 } },
  { catalogueId: 'ill-met-sonde', type: 'payload', name: 'Example meteorological sensor package', summary: 'Temperature, humidity and pressure sensors with a serial data output, for atmospheric research flights.', specs: { supplyVoltageMin: 3.3, supplyVoltageMax: 5.5, supplyCurrent: 0.08, logicLevel: 3.3, tolerant5V: false, mass: 0.05 }, interfaces: { uart: 1, i2c: 0, usb: 0, ethernet: 0, pwm: 0, can: 0 } },
]);

const MAP = new Map(CATALOGUE.map((e) => [e.catalogueId, e]));
export const catalogueEntry = (id) => MAP.get(id) ?? null;

/**
 * Coherent example avionics sets, matched to the kind of aircraft.
 *   quad  — 4S, 450–550 mm quadcopter     hexa — 6S heavy-lift hexacopter
 *   micro — 2S micro quadcopter           fixed-wing — 4S electric fixed wing
 *   vtol  — 6S quadplane (4 lift + 1 cruise ESC)
 * Returns { items, connections } built with the given factories so ids are fresh.
 */
export function exampleSet(kind, { createComponent, createConnection }, { motors, battery: batteryId } = {}) {
  const c = (id, extra = {}) => createComponent({ catalogueEntry: MAP.get(id), ...extra });
  const link = (k, from, to) => createConnection({ kind: k, from: from.id, to: to.id });
  if (kind === 'micro') {
    const battery = c('ill-bat-2s-450');
    const fc = c('ill-fc-aio-micro');
    const escs = c('ill-esc-5a-micro', { quantity: 4 });
    const rx = c('ill-rx-serial');
    return { items: [battery, fc, escs, rx], connections: [link('power', battery, fc), link('power', battery, escs), link('power', fc, rx), link('pwm', fc, escs), link('uart', fc, rx)] };
  }
  const six = kind === 'hexa' || kind === 'vtol';
  const battery = c(batteryId ?? (six ? 'ill-bat-6s-10000' : 'ill-bat-4s-5000'));
  const pm = c('ill-pm-5v-3a');
  const fc = c('ill-fc-h7');
  const escCount = motors ?? { quad: 4, hexa: 6, 'fixed-wing': 1, vtol: 5 }[kind] ?? 4;
  const escs = c('ill-esc-40a', { quantity: escCount });
  const rx = c('ill-rx-serial');
  const gnss = c('ill-gnss-compass');
  const tel = c('ill-tel-sub1ghz');
  const items = [battery, pm, fc, escs, rx, gnss, tel];
  const connections = [
    link('power', battery, pm),
    link('power', pm, fc),
    link('power', battery, escs),
    link('power', fc, rx),
    link('power', fc, gnss),
    link('power', fc, tel),
    link('pwm', fc, escs),
    link('uart', fc, rx),
    link('uart', fc, gnss),
    link('i2c', fc, gnss),
    link('uart', fc, tel),
  ];
  if (kind === 'fixed-wing' || kind === 'vtol') {
    const airspeed = c('ill-airspeed-i2c');
    items.push(airspeed);
    connections.push(link('power', fc, airspeed), link('i2c', fc, airspeed));
  }
  return { items, connections };
}

/** Which example set suits a configuration layout. */
export function exampleSetKind(layoutId, category) {
  if (category === 'micro') return 'micro';
  if (category === 'vtol') return 'vtol';
  if (category === 'fixed-wing' || layoutId === 'solar-glider') return 'fixed-wing';
  if (['hexa-x', 'hexa-plus', 'octo-x', 'octo-plus', 'y6', 'x8'].includes(layoutId)) return 'hexa';
  return 'quad';
}

/** The original 4S quadcopter set (kept for compatibility). */
export const exampleQuadSet = (factories) => exampleSet('quad', factories);

// ---- Motors and propellers (Build 4) — ILLUSTRATIVE --------------------------------------
// Typical classes with round numbers. For real designs use the motor datasheet and measured
// propeller coefficients, for example from the UIUC Propeller Data Site.
const IN = 0.0254;
export const MOTOR_CATALOGUE = Object.freeze([
  { catalogueId: 'ill-mot-1104-7500', name: 'Example 1104 7500 K_v micro motor', summary: 'For 2-inch propellers on 1–2S micro quadcopters.', specs: { kv: 7500, resistance: 0.22, noLoadCurrent: 0.35, maxCurrent: 7, mass: 0.006 } },
  { catalogueId: 'ill-mot-2212-920', name: 'Example 2212 920 K_v motor', summary: 'Classic 3–4S motor for 10-inch propellers on 450–550 mm quadcopters.', specs: { kv: 920, resistance: 0.1, noLoadCurrent: 0.5, maxCurrent: 20, mass: 0.056 } },
  { catalogueId: 'ill-mot-2814-700', name: 'Example 2814 700 K_v motor', summary: '4S motor for 11–13-inch propellers.', specs: { kv: 700, resistance: 0.065, noLoadCurrent: 0.6, maxCurrent: 30, mass: 0.105 } },
  { catalogueId: 'ill-mot-4114-400', name: 'Example 4114 400 K_v motor', summary: '6S motor for 15-inch propellers on hexacopters and VTOL lift.', specs: { kv: 400, resistance: 0.09, noLoadCurrent: 0.45, maxCurrent: 30, mass: 0.16 } },
  { catalogueId: 'ill-mot-3520-520', name: 'Example 3520 520 K_v cruise motor', summary: '4–6S motor for 12–14-inch cruise propellers on 2–5 kg fixed wings.', specs: { kv: 520, resistance: 0.05, noLoadCurrent: 0.8, maxCurrent: 45, mass: 0.2 } },
]);
export const PROPELLER_CATALOGUE = Object.freeze([
  { catalogueId: 'ill-prop-2x1.5', name: 'Example 2 × 1.5 in micro propeller', summary: 'Micro quadcopter propeller.', specs: { diameter: 2 * IN, pitch: 1.5 * IN, ct: 0.1, cp: 0.05, mass: 0.0005 } },
  { catalogueId: 'ill-prop-10x4.5', name: 'Example 10 × 4.5 in propeller', summary: 'Multirotor propeller; coefficients of the order measured for this class (static).', specs: { diameter: 10 * IN, pitch: 4.5 * IN, ct: 0.11, cp: 0.044, mass: 0.012 } },
  { catalogueId: 'ill-prop-12x5.5', name: 'Example 12 × 5.5 in propeller', summary: 'Multirotor propeller for hexacopters.', specs: { diameter: 12 * IN, pitch: 5.5 * IN, ct: 0.11, cp: 0.043, mass: 0.016 } },
  { catalogueId: 'ill-prop-15x5', name: 'Example 15 × 5 in carbon propeller', summary: 'Large multirotor and VTOL lift propeller.', specs: { diameter: 15 * IN, pitch: 5 * IN, ct: 0.1, cp: 0.038, mass: 0.024 } },
  { catalogueId: 'ill-prop-13x8', name: 'Example 13 × 8 in cruise propeller', summary: 'Fixed-wing cruise propeller (static coefficients given).', specs: { diameter: 13 * IN, pitch: 8 * IN, ct: 0.1, cp: 0.058, mass: 0.022 } },
]);
export const motorEntry = (id) => MOTOR_CATALOGUE.find((e) => e.catalogueId === id) ?? null;
export const propellerEntry = (id) => PROPELLER_CATALOGUE.find((e) => e.catalogueId === id) ?? null;

/** Reasonable starting motor + propeller for a configuration (closest propeller size). */
export function defaultPropulsion(configuration, settings) {
  const params = configuration?.params ?? {};
  const D = params.liftPropDiameter ?? params.propDiameter ?? 0.254;
  const prop = [...PROPELLER_CATALOGUE].sort((a, b) => Math.abs(a.specs.diameter - D) - Math.abs(b.specs.diameter - D))[0];
  const motorId = D < 0.08 ? 'ill-mot-1104-7500' : D <= 0.27 ? 'ill-mot-2212-920' : D <= 0.34 ? (params.span ? 'ill-mot-3520-520' : 'ill-mot-2814-700') : 'ill-mot-4114-400';
  const motor = motorEntry(motorId);
  const part = (e) => ({ name: e.name, catalogueId: e.catalogueId, provenance: 'illustrative', source: '', specs: { ...e.specs } });
  return { motor: part(motor), propeller: part(prop), batteryId: null, settings: { ...settings } };
}
