/**
 * Ready-made example designs ("Start from an example").
 * Each builds a complete, consistent project: targets, layout, a matching illustrative
 * parts set, motor and propeller, and (for the glide-sonde) the balloon mission.
 * All parts are illustrative examples; the point is a working starting design to edit.
 */
import { defaultConfiguration, layoutInfo } from './configuration.js';
import { createComponent, createConnection } from './components.js';
import { catalogueEntry, exampleSet, exampleSetKind, defaultPropulsion, motorEntry, propellerEntry } from './catalogue.js';
import { analyseElectrical } from './electrical.js';
import { analysePropulsion } from './propulsion.js';
import { DEFAULT_SETTINGS } from './propulsion.js';
import { defaultSounding, BALLOON_CATALOGUE, balloonAscent } from './sounding.js';
import { computeGeometry } from './geometry.js';
import { defaultAerodynamics } from './aerodynamics.js';

const IN = 0.0254;

export const DESIGN_TEMPLATES = Object.freeze([
  {
    id: 'survey-quad',
    name: 'Survey quadcopter',
    summary: '450 mm-class 4S quadcopter carrying a small camera for about 20 minutes.',
    category: 'multirotor',
    application: 'aerial-mapping',
    layout: 'quad-x',
    motor: 'ill-mot-2814-700',
    requirements: { maxTakeoffMass: 2.0, payloadMass: 0.2, endurance: 900, cruiseSpeed: 10, operatingAltitude: 300 },
    structureMass: 0.35,
  },
  {
    id: 'heavy-hexa',
    name: 'Heavy-lift hexacopter',
    summary: '6S hexacopter with 15-inch propellers for a 1.5 kg payload.',
    category: 'multirotor',
    application: 'inspection',
    layout: 'hexa-x',
    params: { armLength: 0.45, propDiameter: 15 * IN, bodyDiameter: 0.2 },
    motor: 'ill-mot-4114-400',
    propeller: 'ill-prop-15x5',
    requirements: { maxTakeoffMass: 7, payloadMass: 1.5, endurance: 900, cruiseSpeed: 10, operatingAltitude: 300 },
    structureMass: 1.4,
  },
  {
    id: 'mapping-wing',
    name: 'Mapping fixed wing',
    summary: '2 m conventional electric aircraft for one-hour survey flights.',
    category: 'fixed-wing',
    application: 'aerial-mapping',
    layout: 'conventional',
    requirements: { maxTakeoffMass: 3, payloadMass: 0.3, endurance: 2700, cruiseSpeed: 13, operatingAltitude: 300 },
    structureMass: 0.6,
  },
  {
    id: 'quadplane',
    name: 'VTOL quadplane',
    summary: 'Vertical take-off with four lift rotors, efficient wing-borne cruise.',
    category: 'vtol',
    application: 'search-rescue',
    layout: 'quadplane',
    requirements: { maxTakeoffMass: 5, payloadMass: 0.5, endurance: 3600, cruiseSpeed: 20, operatingAltitude: 300 },
    structureMass: 1.2,
  },
  {
    id: 'micro-quad',
    name: 'Micro quadcopter',
    summary: 'Palm-sized 2S quadcopter for indoor research and teaching.',
    category: 'micro',
    application: 'education',
    layout: 'micro-quad',
    requirements: { maxTakeoffMass: 0.1, endurance: 240, cruiseSpeed: 4 },
    structureMass: 0.02,
  },
  {
    id: 'glidesonde',
    name: 'Balloon-launched glide-sonde',
    summary: 'Small glider lifted to 33 km on a balloon, released, gliding down while sampling, with a powered return.',
    category: 'fixed-wing',
    application: 'atmospheric',
    layout: 'conventional',
    params: { span: 1.2, rootChord: 0.16, taperRatio: 0.6, sweepLE: 0.0349, dihedral: 0.0698, fuselageLength: 0.8, fuselageDiameter: 0.07, wingPosition: 0.22, tailArm: 0.5, hTailSpan: 0.36, hTailChord: 0.09, vTailHeight: 0.14, vTailChord: 0.1, propDiameter: 10 * IN },
    extraParts: ['ill-met-sonde'],
    motor: 'ill-mot-2212-920',
    propeller: 'ill-prop-10x4.5',
    requirements: { maxTakeoffMass: 1.6, endurance: 1800, cruiseSpeed: 14 },
    structureMass: 0.25,
    sounding: true,
  },
]);

export const templateInfo = (id) => DESIGN_TEMPLATES.find((t) => t.id === id) ?? null;

/** Smallest example balloon that reaches the release altitude with ≥ 3 km burst margin. */
export function suggestBalloon(params, aircraftMass, gas = 'helium') {
  for (const b of BALLOON_CATALOGUE) {
    const a = balloonAscent({ ...params, balloonMass: b.specs.mass, burstDiameter: b.specs.burstDiameter }, aircraftMass, gas);
    if (a.reachesRelease && (a.burstAltitude === null || a.burstAltitude - a.releaseAltitudeAMSL >= 3000)) return { balloon: b, ascent: a };
  }
  return null;
}

/** Init object for ProjectManager.createProject(). */
export function templateProject(id, { mass } = {}) {
  const t = templateInfo(id);
  if (!t) throw new Error(`Unknown example design "${id}"`);
  const configuration = defaultConfiguration(t.layout);
  Object.assign(configuration.params, t.params ?? {});
  const factories = { createComponent, createConnection };
  const geometry = computeGeometry(configuration, {});
  const motorCount = geometry?.rotors?.length;
  const components = exampleSet(exampleSetKind(t.layout, t.category), factories, { motors: motorCount, battery: t.battery });
  const fc = components.items.find((i) => i.type === 'flight-controller');
  for (const id of t.extraParts ?? []) {
    const part = createComponent({ catalogueEntry: catalogueEntry(id) });
    components.items.push(part);
    components.connections.push(createConnection({ kind: 'power', from: fc.id, to: part.id }), createConnection({ kind: 'uart', from: fc.id, to: part.id }));
  }
  const propulsion = defaultPropulsion(configuration, { ...DEFAULT_SETTINGS, structureMass: t.structureMass ?? DEFAULT_SETTINGS.structureMass });
  const part = (e) => ({ name: e.name, catalogueId: e.catalogueId, provenance: 'illustrative', source: '', specs: { ...e.specs } });
  if (t.motor) propulsion.motor = part(motorEntry(t.motor));
  if (t.propeller) propulsion.propeller = part(propellerEntry(t.propeller));
  const sounding = { ...defaultSounding(), enabled: Boolean(t.sounding) };
  if (t.sounding) {
    const requirements = Object.fromEntries(Object.entries(t.requirements).map(([k, v]) => [k, { value: v }]));
    const estimate = analysePropulsion({ propulsion, geometry, requirements, components, electrical: analyseElectrical(components) }).mass?.total;
    const suggestion = suggestBalloon(sounding.params, mass ?? estimate ?? t.requirements.maxTakeoffMass, sounding.gas);
    if (suggestion) {
      sounding.balloon = { name: suggestion.balloon.name, catalogueId: suggestion.balloon.catalogueId, provenance: 'illustrative', source: '' };
      sounding.params.balloonMass = suggestion.balloon.specs.mass;
      sounding.params.burstDiameter = suggestion.balloon.specs.burstDiameter;
    }
  }
  const requirements = Object.fromEntries(Object.entries(t.requirements).map(([k, v]) => [k, { value: v }]));
  return {
    name: t.name,
    category: t.category,
    application: t.application,
    description: `${t.summary} Started from the "${t.name}" example; all parts are illustrative.`,
    requirements,
    modules: { configuration, components, propulsion, sounding, aerodynamics: defaultAerodynamics(configuration) },
  };
}

export { layoutInfo };
