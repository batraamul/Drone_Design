/**
 * Learning Centre lessons. Every lesson follows the same structure required of all
 * AEROLAB X modules: beginner explanation, theory, equations, variables with SI
 * units, worked example, interactive calculator, practical considerations, common
 * mistakes and a knowledge check.
 *
 * Worked examples that depend on a model are computed from that model at render
 * time (see `example`), so the text can never drift from the implementation.
 */
import { isa, G0, R_AIR, GAMMA, T0, P0, RHO0, SUTHERLAND_BETA, SUTHERLAND_S, EARTH_RADIUS } from '../../engineering/atmosphere.js';
import { formatNumber } from '../../utils/format.js';

const n = (value, digits = 4) => formatNumber(value, { digits });

export const LESSONS = Object.freeze([
  {
    id: 'data-provenance',
    title: 'Engineering data, provenance and model fidelity',
    icon: 'layers',
    level: 'Foundation',
    minutes: 12,
    summary: 'Why every number needs a source, how verification differs from validation, and how input uncertainty carries into results.',
    beginner: [
      'Every number in a design comes from somewhere: a target you chose, a guess, a datasheet, a calculation, a simulation or a measurement. A design can look excellent on paper and still fail in the air when these are mixed up — for example when a hopeful estimate is later read as if it had been measured.',
      'AEROLAB X therefore labels every engineering value with its provenance. A requirement says what the aircraft should do; it says nothing about what it can do. Only measurement on hardware tells you that, and only within the conditions of the test.',
    ],
    theory: [
      'Verification asks whether a model or program solves its equations correctly. Validation asks whether those equations represent the real system well enough for the intended use. A model can be perfectly verified and still invalid — for example a correct implementation of a hover-power formula applied in strong turbulence.',
      'Model fidelity describes how much physics a model captures. Rules of thumb (conceptual estimates) are fast and very uncertain; analytical models capture the dominant physics under stated assumptions; numerical simulations capture more effects but inherit every assumption of their inputs. Higher fidelity is not automatically more accurate: a detailed simulation fed with assumed inputs is still an assumption.',
      'Uncertainty propagates. When a result is a product or quotient of independent inputs, the relative uncertainties combine approximately in quadrature (first-order propagation, as in the ISO Guide to the Expression of Uncertainty in Measurement).',
    ],
    equations: [
      { expression: 'q = x / y   (or q = x · y)', note: 'Result formed from two independent inputs.' },
      { expression: 'u(q)/|q| ≈ √[ (u(x)/x)² + (u(y)/y)² ]', note: 'First-order propagation of independent relative standard uncertainties.' },
      { expression: 't = E / P', note: 'Endurance from usable energy and average power (constant power assumed).' },
    ],
    variables: [
      { symbol: 'u(x)', meaning: 'Standard uncertainty of input x', unit: 'same unit as x' },
      { symbol: 'E', meaning: 'Usable battery energy', unit: 'J (shown in Wh)' },
      { symbol: 'P', meaning: 'Average electrical power drawn', unit: 'W' },
      { symbol: 't', meaning: 'Endurance', unit: 's (shown in min)' },
    ],
    example: () => ({
      title: 'Endurance with uncertain inputs',
      steps: [
        'Usable energy E = 100 Wh with a relative uncertainty of 5 % (assumption about usable capacity).',
        'Average power P = 400 W with a relative uncertainty of 10 % (conceptual estimate).',
        't = E / P = 100 Wh / 400 W = 0.25 h = 15.0 min.',
        'Relative uncertainty u(t)/t ≈ √(0.05² + 0.10²) = √0.0125 = 0.112, i.e. about 11 %.',
        'Result: t ≈ 15.0 min ± 1.7 min (one standard uncertainty). The power estimate dominates, so improving it (for example by measuring hover current) pays off most.',
      ],
    }),
    calculator: 'uncertainty',
    practical: [
      'Record the source of every datasheet value: document, revision and page. Datasheet ratings are usually specified under particular test conditions.',
      'Record test conditions with measured data: date, setup, instrument, ambient temperature and air density.',
      'Never use illustrative example data in a report as if it described real hardware.',
      'Quote results with no more significant figures than the least certain input supports.',
    ],
    mistakes: [
      'Treating a manufacturer\'s peak or burst rating as a continuous rating.',
      'Presenting simulation output as if it were measured or validated.',
      'Reading a requirement (a target) as a property of the current design.',
      'Ignoring that combined uncertainties grow: several "small" assumptions add up.',
    ],
    quiz: [
      {
        question: 'A battery capacity copied from the manufacturer\'s datasheet should be labelled as:',
        options: ['Measured', 'Datasheet', 'Analytical calculation', 'Requirement'],
        answer: 1,
        explanation: 'It comes from a datasheet, not from your own measurement. Record the document and revision with it.',
      },
      {
        question: 'Validation answers which question?',
        options: [
          'Does the code solve its equations correctly?',
          'Does the model represent the real system well enough for the intended use?',
          'Are all values stored in SI units?',
          'Is the design approved to fly?',
        ],
        answer: 1,
        explanation: 'That is validation. The first option describes verification. No model result is flight approval.',
      },
      {
        question: 't = E / P with E known to ±5 % and P to ±10 % (independent). The relative uncertainty of t is about:',
        options: ['±5 %', '±11 %', '±15 %', '±50 %'],
        answer: 1,
        explanation: '√(0.05² + 0.10²) ≈ 0.112. Independent relative uncertainties combine in quadrature, not by simple addition.',
      },
    ],
    references: [
      'JCGM 100:2008 — Evaluation of measurement data: Guide to the Expression of Uncertainty in Measurement (GUM).',
      'AIAA G-077-1998 — Guide for the Verification and Validation of Computational Fluid Dynamics Simulations.',
    ],
  },
  {
    id: 'si-units',
    title: 'SI units and conversions',
    icon: 'sliders',
    level: 'Foundation',
    minutes: 10,
    summary: 'How AEROLAB X stores quantities, the derived units used in drone engineering, and the conversions that most often go wrong.',
    beginner: [
      'AEROLAB X stores every quantity internally in SI units — kilograms, metres, seconds, amperes, kelvin and units derived from them — and converts only when showing values to you. Calculations therefore never mix units.',
      'Unit mistakes are not a beginner problem: NASA\'s Mars Climate Orbiter was lost in 1999 after one team\'s software produced thruster impulse in pound-force seconds while the navigation software expected newton-seconds.',
    ],
    theory: [
      'The SI has seven base units: metre (m), kilogram (kg), second (s), ampere (A), kelvin (K), mole (mol) and candela (cd). Everything else is derived: newton N = kg·m/s², joule J = N·m, watt W = J/s, volt V = W/A, pascal Pa = N/m², coulomb C = A·s.',
      'Drone practice uses several non-SI units. Battery capacity in mAh is electric charge, not energy; energy needs voltage as well. Thrust is often quoted in grams-force (gf), a force unit, not a mass. Airspeed may be in knots and altitude in feet.',
      'Temperature conversions are affine (they add an offset), unlike the purely multiplicative conversions of other units. Temperature differences in K and °C are equal; absolute temperatures are not.',
    ],
    equations: [
      { expression: 'E = Q · V', note: 'Energy from charge and (average) voltage.' },
      { expression: '1 mAh = 3.6 C,   1 Wh = 3600 J', note: 'Charge and energy conversions.' },
      { expression: '1 kn = 1852 / 3600 m/s ≈ 0.5144 m/s,   1 ft = 0.3048 m', note: 'Exact definitions.' },
      { expression: 'ω = 2π · n / 60', note: 'Angular velocity in rad/s from rotational speed n in rpm.' },
      { expression: 'T[K] = T[°C] + 273.15', note: 'Affine temperature conversion.' },
    ],
    variables: [
      { symbol: 'Q', meaning: 'Electric charge (capacity)', unit: 'C (shown in mAh or Ah)' },
      { symbol: 'V', meaning: 'Voltage', unit: 'V' },
      { symbol: 'E', meaning: 'Energy', unit: 'J (shown in Wh)' },
      { symbol: 'n', meaning: 'Rotational speed', unit: 'rpm' },
      { symbol: 'ω', meaning: 'Angular velocity', unit: 'rad/s' },
    ],
    example: () => ({
      title: 'Energy of a 4S 5000 mAh lithium-polymer pack (nominal)',
      steps: [
        'Four cells in series at a nominal 3.7 V per cell: V = 4 × 3.7 V = 14.8 V.',
        'Capacity Q = 5000 mAh = 5 Ah = 5 × 3600 C = 18 000 C.',
        'Nominal energy E = Q · V = 18 000 C × 14.8 V = 266 400 J.',
        'In watt-hours: 266 400 J / 3600 J/Wh = 74 Wh (the same as 5 Ah × 14.8 V).',
        'This is nominal stored energy. Usable energy is lower: voltage sags under load, and a reserve must be kept. Build 4 models these effects.',
      ],
    }),
    calculator: 'units',
    practical: [
      'Check the dimensions of every equation before using it; both sides must have the same units.',
      'Keep at least four significant figures in intermediate results; round only the final answer.',
      'Label every plot axis and table column with its unit.',
      'When a datasheet unit is unusual, convert it once at entry and record the original value and unit in the notes.',
    ],
    mistakes: [
      'Comparing batteries by mAh alone when their voltages differ; compare Wh.',
      'Using grams-force thrust data as if it were mass, or forgetting the factor g₀ = 9.80665 m/s² when converting to newtons.',
      'Mixing km/h and m/s (factor 3.6) or rpm and rad/s (factor 2π/60).',
      'Converting absolute temperatures by multiplication instead of adding the offset.',
    ],
    quiz: [
      { question: 'How many joules are in one watt-hour?', options: ['3600', '1000', '60', '3.6'], answer: 0, explanation: '1 Wh = 1 W × 3600 s = 3600 J.' },
      {
        question: 'A 3000 mAh battery with an 11.1 V nominal voltage stores about:',
        options: ['33.3 Wh', '3.33 Wh', '333 Wh', '11.1 Wh'],
        answer: 0,
        explanation: '3 Ah × 11.1 V = 33.3 Wh (nominal).',
      },
      {
        question: 'A thrust stand reads 1000 gf. In newtons this is about:',
        options: ['9.81 N', '1 N', '1000 N', '0.102 N'],
        answer: 0,
        explanation: '1000 gf = 1 kgf = 9.80665 N.',
      },
    ],
    references: [
      'BIPM — The International System of Units (SI Brochure), 9th edition, 2019.',
      'NASA — Mars Climate Orbiter Mishap Investigation Board, Phase I Report, 10 November 1999.',
    ],
  },
  {
    id: 'standard-atmosphere',
    title: 'The International Standard Atmosphere',
    icon: 'airfoil',
    level: 'Core',
    minutes: 15,
    summary: 'How temperature, pressure and density change with altitude, why density matters most for drones, and how AEROLAB X computes it.',
    beginner: [
      'Air becomes thinner with height and, up to about 11 km, colder. Because the real atmosphere changes from day to day and place to place, engineers use a standard model — the International Standard Atmosphere (ISA) — so that performance figures can be compared on a common basis.',
      'For drones the key quantity is air density. Rotor thrust at a given rotational speed and wing lift at a given airspeed are both proportional to density. At 3 km the standard density is about 26 % lower than at sea level, so the same propulsion system produces about 26 % less thrust at the same rpm.',
    ],
    theory: [
      'The ISA assumes dry air behaving as an ideal gas (p = ρ·R·T) in hydrostatic equilibrium (dp/dH = −ρ·g₀). Temperature varies linearly with geopotential altitude H inside each layer; integrating the hydrostatic equation then gives pressure, and the gas law gives density.',
      'Layers used by AEROLAB X (U.S. Standard Atmosphere 1976, identical to the ICAO standard below 32 km): troposphere 0–11 km at −6.5 K/km; isothermal 11–20 km at 216.65 K; +1.0 K/km to 32 km; +2.8 K/km to 47 km; isothermal to 51 km; −2.8 K/km to 71 km; −2.0 K/km to 84.852 km.',
      'Layers are defined in geopotential metres, which make gravity constant. Geometric altitude z converts by H = r₀·z/(r₀ + z); the two differ by about 19 m at 11 km.',
      'A non-standard day is modelled by a temperature deviation ΔT at a given pressure altitude: pressure keeps its ISA value, temperature is T_ISA + ΔT, and density follows from the gas law.',
    ],
    equations: [
      { expression: 'T = T_b + L · (H − H_b)', note: 'Temperature in a layer with base H_b, base temperature T_b and lapse rate L.' },
      { expression: 'p = p_b · (T / T_b)^(−g₀ / (R·L))      (L ≠ 0)', note: 'Pressure in a gradient layer.' },
      { expression: 'p = p_b · exp(−g₀ · (H − H_b) / (R · T_b))      (L = 0)', note: 'Pressure in an isothermal layer.' },
      { expression: 'ρ = p / (R · T)', note: 'Ideal-gas law.' },
      { expression: 'a = √(γ · R · T)', note: 'Speed of sound.' },
      { expression: 'μ = β · T^(3/2) / (T + S)', note: "Sutherland's law for dynamic viscosity; ν = μ / ρ." },
      { expression: 'H = r₀ · z / (r₀ + z)', note: 'Geopotential from geometric altitude.' },
    ],
    variables: [
      { symbol: 'g₀', meaning: 'Standard gravity', unit: `${G0} m/s²` },
      { symbol: 'R', meaning: 'Specific gas constant of dry air', unit: `${R_AIR} J/(kg·K)` },
      { symbol: 'γ', meaning: 'Ratio of specific heats', unit: `${GAMMA} (dimensionless)` },
      { symbol: 'T₀, p₀, ρ₀', meaning: 'Sea-level temperature, pressure, density', unit: `${T0} K, ${P0} Pa, ${n(RHO0, 5)} kg/m³` },
      { symbol: 'β, S', meaning: 'Sutherland constants for air', unit: `${SUTHERLAND_BETA} kg/(m·s·K^½), ${SUTHERLAND_S} K` },
      { symbol: 'r₀', meaning: 'Effective Earth radius for geopotential', unit: `${EARTH_RADIUS} m` },
      { symbol: 'H, z', meaning: 'Geopotential and geometric altitude', unit: 'm' },
      { symbol: 'L', meaning: 'Temperature lapse rate of the layer', unit: 'K/m' },
    ],
    example: () => {
      const z = 1500;
      const air = isa(z);
      return {
        title: 'Air properties for a survey site at 1500 m above mean sea level',
        steps: [
          `Geopotential altitude: H = r₀·z/(r₀ + z) = ${n(air.geopotentialAltitude, 6)} m (troposphere).`,
          `Temperature: T = 288.15 K − 0.0065 K/m × ${n(air.geopotentialAltitude, 6)} m = ${n(air.temperature, 5)} K (${n(air.temperature - 273.15, 3)} °C).`,
          `Pressure: p = 101 325 Pa × (${n(air.temperature, 5)} / 288.15)^5.2559 = ${n(air.pressure, 5)} Pa (${n(air.pressure / 100, 5)} hPa).`,
          `Density: ρ = p / (R·T) = ${n(air.pressure, 5)} / (287.053 × ${n(air.temperature, 5)}) = ${n(air.density, 4)} kg/m³.`,
          `Density ratio: σ = ${n(air.density, 4)} / 1.225 = ${n(air.densityRatio, 3)}. A rotor at a fixed rpm gives about ${Math.round(air.densityRatio * 100)} % of its sea-level thrust.`,
          `Speed of sound: a = √(1.4 × 287.053 × ${n(air.temperature, 5)}) = ${n(air.speedOfSound, 4)} m/s.`,
        ],
      };
    },
    calculator: 'isa',
    practical: [
      'ISA is a reference, not a forecast. For a specific site and day use measured soundings (radiosonde profiles) or weather-model data.',
      'Hot and high sites combine both penalties: check performance at the density altitude, not the field elevation.',
      'Size propulsion and wings for the highest density altitude in the operating envelope, then check the coldest case for battery performance.',
      'For balloon-assisted and high-altitude research platforms, low density also lowers the Reynolds number and raises the true airspeed needed for the same lift.',
    ],
    mistakes: [
      'Using sea-level density (1.225 kg/m³) for a site at altitude.',
      'Confusing height above ground (AGL) with altitude above mean sea level (AMSL).',
      'Mixing geometric and geopotential altitude in high-altitude work.',
      'Applying the troposphere formula above 11 km, where the temperature stops falling.',
    ],
    quiz: [
      { question: 'ISA temperature at 11 km geopotential altitude is:', options: ['216.65 K', '288.15 K', '223.15 K', '250.00 K'], answer: 0, explanation: '288.15 K − 6.5 K/km × 11 km = 216.65 K, constant up to 20 km.' },
      {
        question: 'On a day hotter than ISA, at the same pressure altitude, air density is:',
        options: ['Lower', 'Higher', 'Unchanged', 'Zero'],
        answer: 0,
        explanation: 'Pressure is the same and temperature is higher, so ρ = p/(R·T) is lower.',
      },
      {
        question: 'At a fixed rotor speed, rotor thrust at σ = 0.8 compared with sea level is about:',
        options: ['80 %', '64 %', '89 %', '100 %'],
        answer: 0,
        explanation: 'Thrust at fixed rpm is proportional to density, so it scales with σ.',
      },
    ],
    references: [
      'U.S. Standard Atmosphere, 1976 (NOAA-S/T 76-1562). NOAA, NASA and USAF, Washington DC, 1976.',
      'ICAO Doc 7488/3 — Manual of the ICAO Standard Atmosphere (extended to 80 km), 3rd edition, 1993.',
    ],
  },
]);

export const LEARNING_PATHS = Object.freeze([
  { title: 'Engineering foundations', lessons: ['data-provenance', 'si-units', 'standard-atmosphere'], status: 'available' },
  { title: 'UAV configuration fundamentals', build: 2 },
  { title: 'Electronics, flight controllers and avionics', build: 3 },
  { title: 'RF links and software-defined radio', build: 3 },
  { title: 'Power electronics, motors and batteries', build: 4 },
  { title: 'Aerodynamics and structures', build: 5 },
  { title: 'Flight dynamics and control', build: 6 },
  { title: 'Computer vision and sensor fusion', build: 8 },
  { title: 'Navigation, autonomy and edge AI', build: 9 },
  { title: 'Digital twins', build: 10 },
  { title: 'Micro aerial vehicles', build: 6 },
]);

export function getLesson(id) {
  return LESSONS.find((lesson) => lesson.id === id) ?? null;
}
