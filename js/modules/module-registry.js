/**
 * Module registry: every navigation entry, its planned build, scope and status.
 *
 * status:
 *   'available' — implemented and tested in the current build
 *   'partial'   — implemented in part; the page says exactly what exists
 *   'planned'   — not implemented; the page describes the plan and performs no calculations
 */
import { BUILD_NUMBER } from '../version.js';

export const NAV_GROUPS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'design', label: 'Design' },
  { id: 'labs', label: 'Engineering labs' },
  { id: 'operations', label: 'Operations' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'assurance', label: 'Assurance & records' },
  { id: 'system', label: 'System' },
]);

export const MODULES = Object.freeze([
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'dashboard',
    group: 'overview',
    status: 'available',
    builds: [1],
    summary: 'Current project, design requirements, design review, data safety and roadmap at a glance.',
    scope: [],
  },
  {
    id: 'projects',
    title: 'My Projects',
    icon: 'folder',
    group: 'overview',
    status: 'available',
    builds: [1],
    summary: 'Create, duplicate, version, compare, import, export and document drone design projects.',
    scope: [],
  },
  {
    id: 'architecture',
    title: 'Drone Architecture',
    icon: 'multirotor',
    group: 'design',
    status: 'partial',
    builds: [2, 3],
    summary: 'Choose the layout of a multirotor, fixed-wing, VTOL, special or micro aircraft, set its key dimensions, and see scale drawings and geometry checks.',
    scope: [
      'Configuration wizard for quadcopter, hexacopter, octocopter and coaxial multirotors in X, +, H and other layouts.',
      'Conventional, flying-wing, delta, swept-wing and glider fixed-wing layouts with tractor or pusher propulsion.',
      'Quadplane, tilt-rotor, tilt-wing, lift-and-cruise and tailsitter VTOL; tethered, solar-assisted and balloon-assisted platforms.',
      'Configuration-specific parameters and propulsion arrangement (Build 2); power and avionics architecture, constraints and trade-offs (Build 3).',
    ],
    dependsOn: ['projects'],
    dataShared: ['configuration', 'geometry'],
  },
  {
    id: 'design-studio',
    title: '3D Design Studio',
    icon: 'cube',
    group: 'design',
    status: 'partial',
    builds: [2, 5],
    summary: 'Interactive 3D conceptual model linked to the project geometry; mass and component placement follow in later builds.',
    scope: [
      'Rotate, pan, zoom and top/front/side views (Three.js with a non-WebGL fallback).',
      'Adjust fuselage length, wingspan, chord, tail geometry, rotor positions, landing gear, battery and payload placement.',
      'Centre-of-gravity marker, mass distribution, component labels, measurement tools and exploded views.',
      'Every geometric change updates the shared engineering model; the view is never merely decorative.',
    ],
    dependsOn: ['architecture'],
    dataShared: ['geometry', 'placement'],
  },
  {
    id: 'micro-lab',
    title: 'Micro Drone Laboratory',
    icon: 'insect',
    group: 'design',
    status: 'planned',
    builds: [2, 6],
    summary: 'Educational models of micro and bio-inspired aerial robots and their scaling limits.',
    scope: [
      'Micro-quadcopter, flapping-wing and biomimetic research concepts (category support arrives in Build 2).',
      'Educational models of miniaturised propulsion, flight mechanics, sensing, power and control limits (Build 6).',
      'Explicit statement that simplified models cannot validate insect-scale flight hardware.',
    ],
    dependsOn: ['architecture', 'flight-dynamics'],
    dataShared: ['configuration'],
  },
  {
    id: 'avionics',
    title: 'Avionics Laboratory',
    icon: 'chip',
    group: 'labs',
    status: 'partial',
    builds: [3, 7],
    summary: 'Electrical architecture: components, power and data connections, block diagram, power budget and compatibility checks.',
    scope: [
      'Flight controller, MCU/processor, clock, memory, real-time and data-logging considerations.',
      'PWM, UART, SPI, I²C, CAN, Ethernet and USB interface modelling with compatibility checks.',
      'Navigation and sensor catalogue (IMU, GNSS, barometer, magnetometer, airspeed, optical flow, LiDAR) with sourced specifications only.',
      'Interactive block diagram with voltage domains and power draw (Build 3); telemetry link budget and educational SDR visualisations (Build 7).',
    ],
    dependsOn: ['components'],
    dataShared: ['avionics', 'powerLoads'],
  },
  {
    id: 'propulsion',
    title: 'Propulsion Laboratory',
    icon: 'propeller',
    group: 'labs',
    status: 'planned',
    builds: [4],
    summary: 'Brushless motor, propeller and ESC models, thrust curves and operating points.',
    scope: [
      'BLDC motor characteristics: KV, voltage, current, speed, torque, electrical power and thermal considerations.',
      'Propeller diameter and pitch, estimated thrust and efficiency, operating point and motor/propeller comparison.',
      'ESC ratings and compatibility; thrust, current-versus-throttle and efficiency graphs with labelled empirical assumptions.',
    ],
    dependsOn: ['components', 'power'],
    dataShared: ['propulsion'],
  },
  {
    id: 'power',
    title: 'Power & Energy',
    icon: 'battery',
    group: 'labs',
    status: 'planned',
    builds: [4],
    summary: 'Battery chemistry, energy, voltage sag, power distribution and endurance estimates.',
    scope: [
      'Educational Li-ion, LiPo and LiFePO₄ models: nominal and maximum voltage, capacity, energy, internal resistance and sag.',
      'Mass and power budgets with conservative reserves and battery safety warnings.',
      'Power-flow display from battery to ESCs, avionics, payload and auxiliary loads; endurance estimates that update with every component change.',
    ],
    dependsOn: ['components'],
    dataShared: ['energy', 'massBudget', 'powerBudget'],
  },
  {
    id: 'aerodynamics',
    title: 'Aerodynamics',
    icon: 'airfoil',
    group: 'labs',
    status: 'planned',
    builds: [5],
    summary: 'Wing and airfoil design with preliminary analytical aerodynamic estimates.',
    scope: [
      'Airfoil selection, chord, span, area, aspect ratio, wing loading, Reynolds number and lift/drag estimates.',
      'Rectangular, tapered, swept, delta, elliptical and flying-wing planforms with airfoil and polar plots.',
      'Clear separation of preliminary analytical estimates from validated aerodynamic data or CFD.',
    ],
    dependsOn: ['architecture'],
    dataShared: ['aerodynamics'],
  },
  {
    id: 'structures',
    title: 'Structural Analysis',
    icon: 'truss',
    group: 'labs',
    status: 'planned',
    builds: [5],
    summary: 'Materials and preliminary bending, shear, torsion, deflection and vibration estimates.',
    scope: [
      'Educational records for aluminium, carbon and glass fibre, engineering plastics, foam and wood.',
      'Preliminary stress, strain, deflection, factor-of-safety and basic vibration estimates with load diagrams.',
      'Labelled as simplified analysis; never presented as certified FEA or structural certification.',
    ],
    dependsOn: ['architecture'],
    dataShared: ['structures'],
  },
  {
    id: 'flight-dynamics',
    title: 'Flight Dynamics',
    icon: 'attitude',
    group: 'labs',
    status: 'planned',
    builds: [6],
    summary: 'Documented rigid-body models, control response, PID tuning education and disturbance response.',
    scope: [
      'Pitch, roll, yaw, climb, descent, hover, forward flight, turns, acceleration and deceleration.',
      'Simplified Newtonian and rotational dynamics with inertia estimates, CG effects, damping and disturbances.',
      'Attitude, rates, position, velocity, altitude and acceleration versus time; PID tuning with configurable wind.',
    ],
    dependsOn: ['propulsion', 'aerodynamics'],
    dataShared: ['dynamics'],
  },
  {
    id: 'payload',
    title: 'Payload Laboratory',
    icon: 'camera',
    group: 'operations',
    status: 'planned',
    builds: [7],
    summary: 'Civilian cameras, mapping sensors and scientific instruments with camera geometry calculations.',
    scope: [
      'RGB, global/rolling-shutter, thermal, multispectral, hyperspectral, stereo, depth and mapping cameras; LiDAR and environmental instruments.',
      'Sensor size, focal length, field of view, ground sample distance, footprint, overlap, exposure, power and storage.',
      'Payload mass and placement propagate automatically into CG, power, endurance and payload margin.',
    ],
    dependsOn: ['power', 'design-studio'],
    dataShared: ['payload'],
  },
  {
    id: 'mission',
    title: 'Mission Planner',
    icon: 'route',
    group: 'operations',
    status: 'planned',
    builds: [7],
    summary: 'Civilian waypoint, survey and search-pattern missions with energy and weather feasibility.',
    scope: [
      'Waypoints, altitude and speed profiles, survey grids and search-and-rescue survey patterns.',
      'Wind and weather inputs, energy and reserve estimates, geofencing and airspace-restriction awareness.',
      'Map view when a provider is configured, simulated environment otherwise; feasibility reports that are never regulatory permission.',
    ],
    dependsOn: ['power', 'payload'],
    dataShared: ['missions'],
  },
  {
    id: 'simulator',
    title: 'Flight Simulator',
    icon: 'simulator',
    group: 'operations',
    status: 'planned',
    builds: [6, 10],
    summary: 'Deterministic virtual flights and fault scenarios, growing into the integrated digital twin.',
    scope: [
      'Virtual flights showing attitude, altitude, velocity, position, heading, battery, motor and sensor status.',
      'Scenarios: wind disturbance, sensor failure, GNSS loss, link loss, low battery, motor fault, vibration and payload-power failure.',
      'Deterministic, documented models with configurable initial conditions; simulation data always labelled as such.',
    ],
    dependsOn: ['flight-dynamics'],
    dataShared: ['simulations'],
  },
  {
    id: 'sounding',
    title: 'Stratospheric Sounding Lab',
    icon: 'balloon',
    group: 'operations',
    status: 'planned',
    builds: [13],
    summary: 'Balloon-borne and glide-back sounding platforms for meteorological research: ascent, release, recovery glide and sonde data.',
    scope: [
      'Balloon ascent model: lift gas, free lift, burst altitude and ascent rate through the ISA and user-supplied soundings.',
      'Release-to-glide transition and low-Reynolds-number glide-back recovery of a sonde glider (simulation only).',
      'Radiosonde sensor models (temperature, humidity, pressure, wind from GNSS) with documented error and lag characteristics.',
      'Export of simulated profiles in WMO-style formats (TEMP-like text, BUFR template description); simulated data always labelled.',
    ],
    dependsOn: ['flight-dynamics', 'payload'],
    dataShared: ['soundings'],
  },
  {
    id: 'ai-lab',
    title: 'AI & Autonomous Intelligence Lab',
    icon: 'neural',
    group: 'intelligence',
    status: 'planned',
    builds: [8, 9, 10],
    summary: 'Computer vision, sensor fusion, benign autonomy, reinforcement learning, health monitoring and edge AI — all in simulation.',
    scope: [
      'Computer vision on sample data and virtual camera streams, with precision, recall, F1, mAP, latency and FPS.',
      'Sensor fusion comparisons (complementary, Kalman, EKF, UKF, particle filters) with injected noise, bias, drift and faults.',
      'Benign path planning (A*, Dijkstra, RRT, RRT*), safe reinforcement-learning exercises and predictive maintenance on labelled synthetic data.',
      'Edge deployment estimates with transparent methodology; measured and estimated benchmarks always distinguished; no learned policy ever drives physical controls.',
    ],
    dependsOn: ['simulator'],
    dataShared: ['ai'],
  },
  {
    id: 'safety',
    title: 'Safety & Reliability',
    icon: 'shield',
    group: 'assurance',
    status: 'planned',
    builds: [11, 14],
    summary: 'Hazard identification, FMEA, risk matrices, loss-of-link behaviour, and defence-style assurance and qualification checklists.',
    scope: [
      'Hazard identification, FMEA with stated probability assumptions, severity and risk matrix.',
      'Battery, electrical, propeller and communication safety; simulated safe return and emergency landing.',
      'Regulatory-awareness checklists with jurisdiction, effective date and source — never legal approval or flight permission.',
      'Build 14: environmental and EMC qualification planning (MIL-STD-810 / MIL-STD-461 / DO-160 style test matrices), reliability prediction and FMECA, requirements traceability and configuration management, link-security and GNSS-denied navigation research checklists. No weapon, targeting or payload-release functions.',
    ],
    dependsOn: ['simulator'],
    dataShared: ['safety'],
  },
  {
    id: 'components',
    title: 'Component Library',
    icon: 'component',
    group: 'assurance',
    status: 'partial',
    builds: [3, 4],
    summary: 'Searchable library of batteries, power, avionics, link, sensor and payload parts; motors and propellers follow in Build 4.',
    scope: [
      'Records with manufacturer, model, specifications, dimensions, mass, electrical ratings, interfaces, datasheet URL and source.',
      'Custom user components; illustrative entries clearly marked; manufacturer specifications never invented.',
    ],
    dependsOn: [],
    dataShared: ['components'],
  },
  {
    id: 'reports',
    title: 'Engineering Reports',
    icon: 'report',
    group: 'assurance',
    status: 'planned',
    builds: [11, 15],
    summary: 'PDR/CDR drafts, budgets, assessments, FMEA, bill of materials, test plans and publication-ready validation reports.',
    scope: [
      'PDR, CDR draft, system requirements, architecture, avionics, power and mass budgets, propulsion, aerodynamic and structural assessments.',
      'Mission feasibility, safety assessment and FMEA, bill of materials, test plan, simulation and AI benchmark results.',
      'PDF, CSV, JSON and printable HTML with assumptions, equations, units, limitations, data provenance and design version.',
      'Build 15: reproducible validation benchmark report, figure and table export for journal manuscripts, citation metadata and archived release.',
    ],
    dependsOn: ['safety'],
    dataShared: ['reports'],
  },
  {
    id: 'learning',
    title: 'Learning Centre',
    icon: 'book',
    group: 'system',
    status: 'partial',
    builds: [1, 12],
    summary: 'Lessons with theory, equations, worked examples, calculators and knowledge checks, plus a technical glossary.',
    scope: [],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'sliders',
    group: 'system',
    status: 'available',
    builds: [1],
    summary: 'Appearance, units, autosave, storage, backups and application updates.',
    scope: [],
  },
]);

export const BUILDS = Object.freeze([
  { number: 1, name: 'Foundation', scope: 'Application shell, navigation, dashboard, themes, project manager, IndexedDB, autosave, documentation.', acceptance: 'App launches, navigation works, projects create/save/reload, no critical console errors, tests pass.' },
  { number: 2, name: 'Configuration and 3D design', scope: 'Aircraft categories, configuration wizard, geometry parameters, initial 2D/3D conceptual models.', acceptance: 'Configurations persist and visualisations respond to parameter changes.' },
  { number: 3, name: 'Avionics and electronics', scope: 'Component catalogue, interfaces, block diagrams, power draw and compatibility checks.', acceptance: 'Components can be added, connected, saved and checked.' },
  { number: 4, name: 'Propulsion and energy', scope: 'Motor, propeller and battery models, mass and power budgets, endurance estimates.', acceptance: 'Equations tested and dependent project values update.' },
  { number: 5, name: 'Aerodynamics and structures', scope: 'Wing geometry, aerodynamic estimates, CG and preliminary structural models.', acceptance: 'Plots update, units are correct and model limitations are documented.' },
  { number: 6, name: 'Flight dynamics', scope: 'Attitude/trajectory simulation, wind disturbance, response plots and deterministic scenarios.', acceptance: 'Reproducible simulation and visible response to parameter changes.' },
  { number: 7, name: 'Mission and payload', scope: 'Civilian payloads, camera calculations, waypoints, profiles, weather inputs and mission feasibility.', acceptance: 'Payload mass/power affects aircraft budget and mission estimates.' },
  { number: 8, name: 'AI perception and health', scope: 'Computer vision demonstration, sensor-fusion comparisons, predictive maintenance and anomaly detection.', acceptance: 'At least one vision model or documented inference demo, two fusion approaches and a reproducible maintenance/anomaly example.' },
  { number: 9, name: 'AI autonomy and edge computing', scope: 'Benign path-planning comparisons, reinforcement-learning exercise, model benchmarking and edge deployment estimates.', acceptance: 'Two path planners, one safe RL exercise and transparent edge benchmark methodology.' },
  { number: 10, name: 'Integrated digital twin', scope: 'Connect geometry, dynamics, virtual sensors, camera stream, energy, simulation and AI outputs.', acceptance: 'Simulated aircraft state and AI results are synchronised and saved.' },
  { number: 11, name: 'Engineering intelligence and reports', scope: 'Compatibility engine, warnings, sensitivity analysis, design comparison, FMEA and exportable reports.', acceptance: 'Warnings are explainable and reports include assumptions and versioning.' },
  { number: 12, name: 'Release', scope: 'Regression, performance, storage, UI, accessibility, browser and deployment testing; documentation and release.', acceptance: 'Clean deployment, stable application, verified update flow and documented known limitations.' },
  { number: 13, name: 'Stratospheric sounding', scope: 'Balloon ascent and burst, release-to-glide transition, glide-back recovery simulation, radiosonde sensor models and WMO-style profile export.', acceptance: 'Ascent rate and burst altitude match published balloon data within stated tolerance; simulated profiles export and re-import; all simulated data labelled.' },
  { number: 14, name: 'Defence-style assurance', scope: 'Environmental and EMC qualification test planning, reliability prediction and FMECA, traceability and configuration management, link-security and GNSS-denied navigation research checklists (no weapon or targeting functions).', acceptance: 'Every requirement traces to design data and a verification method; FMECA and reliability results reproducible; checklists cite their source standard and revision.' },
  { number: 15, name: 'Open publication', scope: 'Validation benchmarks against published data, usability study kit, reproducible results package, Apache-2.0 release with CITATION.cff and archived DOI, manuscript for an IEEE Transactions venue.', acceptance: 'Benchmarks reproduce from a clean clone with one command; archived release with DOI; manuscript figures generated from the released code.' },
]);

export function buildStatus(number) {
  if (number < BUILD_NUMBER) return 'complete';
  if (number === BUILD_NUMBER) return 'current';
  return 'planned';
}

const MODULE_MAP = new Map(MODULES.map((module) => [module.id, module]));

export function getModule(id) {
  return MODULE_MAP.get(id) ?? null;
}

export function modulesInGroup(groupId) {
  return MODULES.filter((module) => module.group === groupId);
}

export function statusLabel(module) {
  if (module.status === 'available') return 'Available';
  if (module.status === 'partial') return 'Partial';
  return `Planned · Build ${module.builds.join(' & ')}`;
}
