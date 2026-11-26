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
import { wingPlanform } from '../../engineering/geometry.js';
import { rotorOperatingPoint } from '../../engineering/propulsion.js';
import { balloonAscent, defaultSounding } from '../../engineering/sounding.js';
import { liftingLine } from '../../engineering/aerodynamics.js';
import { armCheck, MATERIALS } from '../../engineering/structures.js';

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
  {
    id: 'rotor-layout-hover',
    title: 'Multirotor layout, disc loading and ideal hover power',
    icon: 'multirotor',
    level: 'Configuration',
    minutes: 15,
    summary: 'How rotor count and arrangement set the frame size, why propeller tips need clearance, and what momentum theory says about hover power.',
    beginner: [
      'A multirotor hovers by pushing air down. Each propeller sweeps a circle, its disc. Together the discs must push down a mass of air every second whose momentum change equals the aircraft weight.',
      'Pushing a lot of air slowly costs less power than pushing a little air fast. That is why large, slow propellers are efficient in hover, and why the frame must be big enough to fit them without the tips touching.',
    ],
    theory: [
      'Rotors sit on a circle of radius R around the centre (X, + and the hexa and octo layouts), or at the corners of a rectangle (H). On a regular n-rotor ring, neighbouring rotor axes are s = 2R sin(π/n) apart. The propeller tips clear each other only if s exceeds the diameter D. A margin of about 10 % of D is a common rule of thumb against aerodynamic interference and arm flex.',
      'Neighbouring rotors spin in opposite directions so that their reaction torques cancel in hover. Yaw is controlled by speeding up one set and slowing the other. A tricopter has an odd number of rotors, so it needs a tilting motor for yaw.',
      'Momentum (actuator-disc) theory treats the rotors as ideal discs of total area A. In hover the thrust T = W produces an induced velocity v_h = √(T / (2ρA)) and needs at least the ideal power P = T·v_h. Real rotors need more power: blade profile drag, tip losses and swirl give a figure of merit below 1, typically about 0.5–0.75 for small propellers. Propulsion models in Build 4 add these losses.',
      'Disc loading DL = T/A is the key number: P_ideal = T·√(DL/(2ρ)). Doubling the disc area at constant weight lowers ideal hover power by a factor √2. Thinner air (high altitude) raises it as 1/√ρ.',
      'Coaxial pairs (Y6, X8) put two rotors on one axis. They add thrust and redundancy in a compact frame, but the lower rotor works in the upper rotor’s wake. AEROLAB X therefore counts the pair’s disc area once.',
    ],
    equations: [
      { expression: 's = 2 R sin(π / n)', note: 'Spacing of neighbouring rotor axes on a regular ring of n rotors.' },
      { expression: 'c_tip = s − D', note: 'Propeller tip clearance; must be positive.' },
      { expression: 'A = n_axes · π D² / 4', note: 'Total (projected) disc area.' },
      { expression: 'DL = m g₀ / A', note: 'Disc loading in hover.' },
      { expression: 'v_h = √(DL / (2ρ)),   P_ideal = m g₀ · v_h', note: 'Ideal momentum theory (figure of merit = 1).' },
    ],
    variables: [
      { symbol: 'R', meaning: 'Rotor distance from the frame centre', unit: 'm' },
      { symbol: 'n', meaning: 'Number of rotor axes', unit: '—' },
      { symbol: 'D', meaning: 'Propeller diameter', unit: 'm (often quoted in inches)' },
      { symbol: 'A', meaning: 'Total disc area', unit: 'm²' },
      { symbol: 'DL', meaning: 'Disc loading', unit: 'Pa = N/m²' },
      { symbol: 'ρ', meaning: 'Air density', unit: 'kg/m³' },
      { symbol: 'v_h', meaning: 'Ideal induced velocity in hover', unit: 'm/s' },
      { symbol: 'P_ideal', meaning: 'Ideal hover power (lower bound)', unit: 'W' },
    ],
    example: () => {
      const R = 0.225;
      const D = 0.254;
      const m = 1.5;
      const s = 2 * R * Math.sin(Math.PI / 4);
      const A = (4 * Math.PI * D * D) / 4;
      const DL = (m * G0) / A;
      const vh = Math.sqrt(DL / (2 * RHO0));
      return {
        title: 'A 1.5 kg quadcopter X with 10-inch propellers',
        steps: [
          `R = 225 mm (450 mm frame), D = 10 in = 254 mm, m = 1.5 kg, sea level ρ = ${n(RHO0, 4)} kg/m³.`,
          `Axis spacing s = 2 × 0.225 × sin(45°) = ${n(s * 1000, 4)} mm, so the tip clearance is ${n((s - D) * 1000, 3)} mm (${n(((s - D) / D) * 100, 3)} % of D: acceptable).`,
          `Disc area A = 4 × π × 0.254² / 4 = ${n(A, 4)} m².`,
          `Disc loading DL = 1.5 × 9.80665 / ${n(A, 4)} = ${n(DL, 4)} Pa.`,
          `Induced velocity v_h = √(${n(DL, 4)} / (2 × ${n(RHO0, 4)})) = ${n(vh, 4)} m/s.`,
          `Ideal hover power = ${n(m * G0, 4)} N × ${n(vh, 4)} m/s = ${n(m * G0 * vh, 4)} W. With a figure of merit of about 0.6 the rotors would need roughly ${n((m * G0 * vh) / 0.6, 3)} W of shaft power, before motor and controller losses.`,
        ],
      };
    },
    calculator: 'hover',
    practical: [
      'Check propeller clearance with the actual propeller, including its tolerance and any flex of the arms under load.',
      'Keep the propeller discs clear of the central body; blocking the downwash costs thrust.',
      'Follow the flight controller’s documented motor numbering and spin directions exactly; mistakes flip the aircraft on take-off.',
      'Recompute hover power at the highest and hottest place you intend to operate: lower density raises the power needed.',
    ],
    mistakes: [
      'Treating ideal hover power as the battery power needed (it ignores rotor, motor and controller losses).',
      'Counting both rotors of a coaxial pair as independent disc area.',
      'Choosing propellers first and arms afterwards, leaving the tips overlapping.',
      'Comparing frame sizes measured differently (motor-to-motor diagonal versus arm length).',
    ],
    quiz: [
      {
        question: 'On a hexacopter (n = 6) with rotors at R = 300 mm, what is the largest propeller diameter that still clears its neighbours?',
        options: ['150 mm', '300 mm', '424 mm', '600 mm'],
        answer: 1,
        explanation: 's = 2R sin(π/6) = R = 300 mm. The diameter must stay below 300 mm, and in practice about 10 % less.',
      },
      {
        question: 'At constant weight, the total disc area is doubled. Ideal hover power changes by a factor of:',
        options: ['1/2', '1/√2', '√2', '2'],
        answer: 1,
        explanation: 'P_ideal = T √(T / (2ρA)) ∝ A^(−1/2), so doubling A divides the ideal power by √2.',
      },
      {
        question: 'Why do neighbouring rotors on a quadcopter spin in opposite directions?',
        options: ['To increase thrust', 'So their reaction torques cancel and yaw can be controlled', 'To reduce noise', 'Because motors only turn one way'],
        answer: 1,
        explanation: 'Equal and opposite torques cancel in hover. Yaw comes from changing the speed of one set against the other.',
      },
    ],
    references: [
      'J. G. Leishman, Principles of Helicopter Aerodynamics, 2nd ed., Cambridge University Press, 2006 — chapter 2 (momentum theory, figure of merit).',
      'R. Mahony, V. Kumar, P. Corke, “Multirotor aerial vehicles: modeling, estimation, and control of quadrotor”, IEEE Robotics & Automation Magazine 19(3), 2012.',
    ],
  },
  {
    id: 'wing-planform-tail',
    title: 'Wing planform and tail volume coefficients',
    icon: 'fixedWing',
    level: 'Configuration',
    minutes: 15,
    summary: 'Reading a wing from its span, chords and sweep: area, aspect ratio, mean aerodynamic chord, and how big the tail must be.',
    beginner: [
      'Seen from above, most small-UAV wings are trapezoids. Five numbers describe them: span, root chord, taper ratio (tip chord / root chord), leading-edge sweep and dihedral.',
      'From these come the wing area, which carries the weight, and the aspect ratio, which governs induced drag. They also give the mean aerodynamic chord, the reference length used for stability and for placing the centre of gravity.',
      'The tail keeps the aircraft pointing into the wind. What matters is not its area alone but its area times its distance from the wing, compared with the wing itself. That ratio is the tail volume coefficient.',
    ],
    theory: [
      'For a straight-tapered wing with root chord c_r, taper ratio λ and span b, the reference area is S = b c_r (1 + λ) / 2 and the aspect ratio is AR = b² / S.',
      'The mean aerodynamic chord (MAC) c̄ = (2/3) c_r (1 + λ + λ²) / (1 + λ) lies at ȳ = (b/6)(1 + 2λ)/(1 + λ) from the centreline. For subsonic flight the wing’s aerodynamic centre is close to the quarter-chord point of the MAC.',
      'Sweep differs along the chord when the wing is tapered: tan Λ_n = tan Λ_LE − 4n(1 − λ) / (AR (1 + λ)) for the line at fraction n of the chord. Quarter-chord sweep (n = 0.25) is the one that matters aerodynamically.',
      'Tail volume coefficients compare tail moment capacity with the wing: V_H = S_h l_t / (S c̄) for pitch and V_V = S_v l_t / (S b) for yaw. Conceptual design uses historical values as a starting point: roughly 0.4–0.7 for V_H and 0.02–0.05 for V_V on light aircraft and gliders (Raymer, table 6.4). They are not stability proofs: Build 6 analyses stability properly.',
      'A V-tail’s two panels of total area S_V act like a horizontal tail of S_V cos²Γ and a vertical tail of S_V sin²Γ, where Γ is the panel dihedral (a first approximation).',
    ],
    equations: [
      { expression: 'S = b c_r (1 + λ) / 2,   AR = b² / S', note: 'Trapezoidal wing area and aspect ratio.' },
      { expression: 'c̄ = (2/3) c_r (1 + λ + λ²)/(1 + λ),   ȳ = (b/6)(1 + 2λ)/(1 + λ)', note: 'Mean aerodynamic chord and its spanwise position.' },
      { expression: 'tan Λ_c/4 = tan Λ_LE − (1 − λ) / (AR (1 + λ))', note: 'Quarter-chord sweep from leading-edge sweep.' },
      { expression: 'V_H = S_h l_t / (S c̄),   V_V = S_v l_t / (S b)', note: 'Horizontal and vertical tail volume coefficients.' },
    ],
    variables: [
      { symbol: 'b', meaning: 'Wing span', unit: 'm' },
      { symbol: 'c_r, c_t', meaning: 'Root and tip chord', unit: 'm' },
      { symbol: 'λ', meaning: 'Taper ratio c_t / c_r', unit: '—' },
      { symbol: 'Λ_LE', meaning: 'Leading-edge sweep', unit: 'rad (shown in degrees)' },
      { symbol: 'S, AR', meaning: 'Wing area, aspect ratio', unit: 'm², —' },
      { symbol: 'c̄', meaning: 'Mean aerodynamic chord', unit: 'm' },
      { symbol: 'l_t', meaning: 'Tail arm (wing to tail aerodynamic centre)', unit: 'm' },
      { symbol: 'S_h, S_v', meaning: 'Horizontal and vertical tail area', unit: 'm²' },
    ],
    example: () => {
      const wp = wingPlanform({ span: 2, rootChord: 0.3, taperRatio: 0.6, sweepLE: 0 });
      const VH = (0.6 * 0.16 * 0.8) / (wp.area * wp.mac);
      const VV = (0.25 * 0.18 * 0.8) / (wp.area * 2);
      return {
        title: 'A 2 m survey aircraft',
        steps: [
          'b = 2 m, c_r = 300 mm, λ = 0.6 (c_t = 180 mm), no sweep.',
          `S = 2 × 0.3 × 1.6 / 2 = ${n(wp.area, 4)} m²; AR = 4 / ${n(wp.area, 4)} = ${n(wp.aspectRatio, 4)}.`,
          `c̄ = (2/3) × 0.3 × (1 + 0.6 + 0.36) / 1.6 = ${n(wp.mac * 1000, 4)} mm at ȳ = ${n(wp.yMac * 1000, 4)} mm from the centreline.`,
          `Horizontal tail 600 × 160 mm (S_h = 0.096 m²) at l_t = 0.8 m: V_H = 0.096 × 0.8 / (${n(wp.area, 4)} × ${n(wp.mac, 4)}) = ${n(VH, 3)}, within the typical range.`,
          `Fin 250 × 180 mm (S_v = 0.045 m²): V_V = 0.045 × 0.8 / (${n(wp.area, 4)} × 2) = ${n(VV, 3)}, within the typical range.`,
        ],
      };
    },
    calculator: 'planform',
    practical: [
      'Place the centre of gravity relative to the MAC, not the root chord; the MAC is the reference used in stability margins.',
      'A longer tail arm lets a smaller tail do the same job, at the cost of a longer, heavier boom.',
      'High aspect ratio is efficient but flexible; check wing bending and flutter for long, thin wings (Build 5).',
      'Tail volume coefficients are a starting point. Confirm stability with the static-margin analysis.',
    ],
    mistakes: [
      'Computing aspect ratio with the root chord instead of the area (only correct for rectangular wings).',
      'Measuring the tail arm from the nose or the wing leading edge instead of between the aerodynamic centres.',
      'Treating a typical tail volume as a guarantee of stability.',
      'Forgetting that a V-tail panel area splits between pitch and yaw.',
    ],
    quiz: [
      {
        question: 'A rectangular wing has span 1.5 m and chord 0.25 m. Its aspect ratio is:',
        options: ['0.375', '4', '6', '9'],
        answer: 2,
        explanation: 'S = 1.5 × 0.25 = 0.375 m², AR = 1.5² / 0.375 = 6 (equal to b/c for a rectangle).',
      },
      {
        question: 'Doubling the tail arm while keeping the horizontal tail the same size changes V_H by a factor of:',
        options: ['0.5', '1', '2', '4'],
        answer: 2,
        explanation: 'V_H = S_h l_t / (S c̄) is proportional to l_t.',
      },
      {
        question: 'For a rectangular wing (λ = 1), the mean aerodynamic chord equals:',
        options: ['Half the chord', 'The chord', 'Two thirds of the chord', 'The span divided by 6'],
        answer: 1,
        explanation: 'c̄ = (2/3) c_r × 3/2 = c_r.',
      },
    ],
    references: [
      'D. P. Raymer, Aircraft Design: A Conceptual Approach, 6th ed., AIAA, 2018 — chapters 4 and 6 (wing geometry, tail sizing, table 6.4).',
      'E. Torenbeek, Synthesis of Subsonic Airplane Design, Delft University Press, 1982 — appendix on planform geometry.',
    ],
  },
  {
    id: 'avionics-power-interfaces',
    title: 'Avionics power budgets, regulators and logic levels',
    icon: 'chip',
    level: 'Electronics',
    minutes: 15,
    summary: 'How to supply every board at a safe voltage, size regulators with margin, and connect data links without damaging inputs.',
    beginner: [
      'Every electronic part on a drone needs power at the right voltage. The battery voltage swings from full to empty, and it is far too high for most boards, so regulators (power modules, BECs) convert it to steady 5 V or 12 V rails.',
      'Each rail can only deliver so much current. Add up what is connected to it, keep a margin, and check that every part accepts the voltage it gets — at full charge and when the battery is nearly empty.',
      'Data links have voltages too. Modern flight controllers use 3.3 V logic; an older 5 V sensor can damage a 3.3 V input unless the input is 5 V tolerant or a level shifter sits between them.',
    ],
    theory: [
      'A battery of n cells in series supplies n·V_cell, where V_cell runs from about 4.2 V (full LiPo) down to about 3.3–3.5 V under load near empty. Every part connected directly to the battery must accept the whole range.',
      'A switching regulator conserves power apart from its losses: V_in I_in η = V_out I_out. Its input current is therefore largest at the lowest input voltage: I_in = V_out I_out / (η V_in,min). Linear regulators instead pass the output current straight through (I_in ≈ I_out) and burn the difference as heat.',
      'A rail is overloaded when the sum of its consumers’ worst-case currents exceeds the regulator rating. Designers usually keep continuous load below about 80 % of the rating to allow for heat, ageing and current spikes (for example radio transmit bursts).',
      'Point-to-point interfaces (UART, SPI, PWM outputs, USB, Ethernet) need one port per device; buses (I²C, CAN) let several devices share one port, distinguished by address. When ports run out, move devices to a bus or use a controller with more ports.',
      'Logic levels: a 5 V output driving a 3.3 V input pushes current through the input’s protection diodes and can destroy it, unless the input is specified as 5 V tolerant. Differential links (CAN, USB, Ethernet) have their own transceivers and do not have this problem.',
    ],
    equations: [
      { expression: 'V_batt ∈ [n V_cell,min , n V_cell,max]', note: 'Battery voltage range (e.g. 4S LiPo: 13.2–16.8 V).' },
      { expression: 'I_in = I_q + V_out I_out / (η V_in,min)', note: 'Switching regulator input current, worst case.' },
      { expression: 'Σ I_load ≤ I_rated (guideline ≤ 0.8 I_rated)', note: 'Rail capacity with derating.' },
      { expression: 't = Q V_nom / P', note: 'Time a battery can sustain a constant load (no reserve, ideal capacity).' },
    ],
    variables: [
      { symbol: 'n', meaning: 'Cells in series', unit: '—' },
      { symbol: 'V_cell', meaning: 'Cell voltage', unit: 'V' },
      { symbol: 'η', meaning: 'Regulator efficiency', unit: '— (shown in %)' },
      { symbol: 'I_q', meaning: 'Regulator quiescent current', unit: 'A' },
      { symbol: 'I_rated', meaning: 'Rated continuous output current', unit: 'A' },
      { symbol: 'Q', meaning: 'Battery capacity', unit: 'C (shown in mAh)' },
      { symbol: 'P', meaning: 'Power drawn', unit: 'W' },
    ],
    example: () => {
      const iout = 1.07;
      const vmin = 4 * 3.3;
      const iin = 0.01 + (5.3 * iout) / (0.9 * vmin);
      const p = iin * 4 * 3.7;
      const t = (5000 * 3.6 * 4 * 3.7) / p;
      return {
        title: 'The example quadcopter avionics',
        steps: [
          'The flight controller (0.30 A) passes 5.3 V to the receiver (0.12 A), GNSS (0.15 A) and telemetry radio (0.50 A): the 5.3 V power module carries 1.07 A of its 3 A rating (36 %).',
          `Its input current at the lowest 4S voltage (13.2 V), with η = 0.9 and I_q = 10 mA: I_in = 0.01 + 5.3 × 1.07 / (0.9 × 13.2) = ${n(iin, 3)} A.`,
          `At the nominal 14.8 V that is ${n(p, 3)} W from the battery.`,
          `A 5000 mAh 4S pack stores 5 Ah × 14.8 V = 74 Wh, so the avionics alone would run for about ${n(t / 60, 3)} min. The motors draw far more: that is the propulsion budget of Build 4.`,
          'Check of voltages: every 5 V device accepts 4.5–5.5 V, so the 5.3 V rail is fine; the ESCs accept 7–26 V, so 13.2–16.8 V is fine.',
        ],
      };
    },
    calculator: 'regulator',
    practical: [
      'Use maximum (not typical) currents from datasheets, and check transmit bursts of radios and boot surges of computers.',
      'Give power-hungry payloads and companion computers their own regulator, so a brown-out cannot reset the flight controller.',
      'Keep GNSS and compass away from high-current wiring; route power and signal grounds deliberately.',
      'Measure the real currents on the bench and record them with provenance “measured”.',
    ],
    mistakes: [
      'Connecting a 5 V-only board straight to the battery.',
      'Forgetting that the regulator input current rises as the battery empties.',
      'Running out of UARTs late in the design: plan the ports early.',
      'Wiring a 5 V sensor to a 3.3 V I²C bus without checking 5 V tolerance.',
    ],
    quiz: [
      {
        question: 'A 6S LiPo can supply a voltage between about:',
        options: ['3.3 and 4.2 V', '11 and 13 V', '19.8 and 25.2 V', '22 and 30 V'],
        answer: 2,
        explanation: '6 × 3.3 V = 19.8 V near empty under load; 6 × 4.2 V = 25.2 V fully charged.',
      },
      {
        question: 'A 90 %-efficient regulator supplies 5 V at 2 A from a 10 V input. Its input current is about:',
        options: ['0.9 A', '1.1 A', '2.0 A', '2.2 A'],
        answer: 1,
        explanation: 'I_in = 5 × 2 / (0.9 × 10) = 1.11 A (ignoring quiescent current).',
      },
      {
        question: 'Which link is NOT at risk from a 5 V / 3.3 V logic mismatch?',
        options: ['UART', 'I²C', 'PWM', 'CAN'],
        answer: 3,
        explanation: 'CAN uses differential transceivers with their own specified levels; the others connect logic pins directly.',
      },
    ],
    references: [
      'P. Horowitz, W. Hill, The Art of Electronics, 3rd ed., Cambridge University Press, 2015 — chapter 9 (voltage regulation).',
      'NXP UM10204, I²C-bus specification and user manual, rev. 7.0, 2021 — electrical characteristics.',
    ],
  },
  {
    id: 'propulsion-energy',
    title: 'Matching motor, propeller and battery',
    icon: 'propeller',
    level: 'Propulsion',
    minutes: 20,
    summary: 'From the thrust you need to propeller speed, motor current and voltage, battery current and endurance — and why K_v, propeller size and cell count must be chosen together.',
    beginner: [
      'In hover every rotor must push up its share of the weight. A propeller makes thrust by spinning: thrust grows with the square of its speed and the fourth power of its diameter, so a slightly bigger propeller needs much less speed.',
      'The motor turns that speed into a voltage requirement (through K_v, revolutions per minute per volt) and the propeller’s torque into a current requirement. The battery must supply that voltage while delivering the current, and it sags as it empties.',
      'A good match hovers at about half throttle, can lift about twice the weight at full throttle, keeps every current within its rating and meets the endurance target.',
    ],
    theory: [
      'Propeller (static, UIUC convention with n in revolutions per second): T = C_T ρ n² D⁴ and P = C_P ρ n³ D⁵. Solving for the hover speed: n = √(T / (C_T ρ D⁴)). The ratio C_T^1.5/(√2 C_P) is the figure of merit, typically 0.5–0.75 for small propellers.',
      'Brushless DC motor: torque constant K_t = 60/(2π K_v) N·m/A, current I = Q/K_t + I₀ (I₀ covers iron and friction losses), voltage V = 60 n/K_v + I R. Efficiency is P_shaft/(V I); it peaks at moderate current, so an oversized or undersized motor wastes energy.',
      'Battery: terminal voltage V = V_oc(SOC) − I R_pack. For an electrical power P the current is I = (V_oc − √(V_oc² − 4 R P))/(2R); if V_oc² < 4RP the pack cannot deliver P at all. Endurance follows from discharging step by step until the planned usable fraction (often 80 %) is used.',
      'Throttle ≈ V_motor/V_battery. Full-throttle thrust comes from solving the motor equation at the full battery voltage; the thrust-to-weight ratio should be about 2 for multirotors.',
      'Hot and high: density falls with altitude and temperature. At 4500 m on an ISA + 30 °C day, ρ is about 0.7 kg/m³ instead of 1.225 kg/m³, so the same thrust needs more speed and much more power — size for the worst operating case.',
    ],
    equations: [
      { expression: 'T = C_T ρ n² D⁴,   P = C_P ρ n³ D⁵', note: 'Static propeller.' },
      { expression: 'I = Q/K_t + I₀,   V = 60 n/K_v + I R,   K_t = 60/(2π K_v)', note: 'Brushless DC motor.' },
      { expression: 'I_batt = (V_oc − √(V_oc² − 4 R P)) / (2R)', note: 'Battery current for power P.' },
      { expression: 'T/W = n_rotors T_max / (m g₀)', note: 'Thrust-to-weight ratio.' },
    ],
    variables: [
      { symbol: 'C_T, C_P', meaning: 'Static thrust and power coefficients', unit: '—' },
      { symbol: 'n', meaning: 'Propeller speed', unit: 'rev/s (rpm/60)' },
      { symbol: 'K_v', meaning: 'Motor velocity constant', unit: 'rpm/V' },
      { symbol: 'R, I₀', meaning: 'Winding resistance, no-load current', unit: 'Ω, A' },
      { symbol: 'R_pack', meaning: 'Battery internal resistance', unit: 'Ω' },
      { symbol: 'V_oc', meaning: 'Open-circuit battery voltage', unit: 'V' },
    ],
    example: () => {
      const op = rotorOperatingPoint({ thrust: (1.4 * 9.80665) / 4, rho: 1.225, diameter: 0.254, ct: 0.11, cp: 0.044, kv: 920, resistance: 0.1, noLoadCurrent: 0.5 });
      return {
        title: 'A 1.4 kg quadcopter on 10-inch propellers and 920 K_v motors',
        steps: [
          `Thrust per rotor T = 1.4 × 9.80665 / 4 = ${n(1.4 * 9.80665 / 4, 4)} N; sea level ρ = 1.225 kg/m³; C_T = 0.11, C_P = 0.044, D = 0.254 m.`,
          `n = √(T / (C_T ρ D⁴)) = ${n(op.n, 4)} rev/s = ${n(op.rpm, 4)} rpm.`,
          `Shaft power P = C_P ρ n³ D⁵ = ${n(op.shaftPower, 4)} W per rotor; torque Q = P/(2πn) = ${n(op.torque, 3)} N·m.`,
          `K_t = 60/(2π × 920) = ${n(op.kt, 4)} N·m/A, so I = Q/K_t + 0.5 = ${n(op.current, 3)} A.`,
          `V = 60 n / K_v + I R = ${n(op.voltage, 3)} V: about ${n((op.voltage / 15.2) * 100, 2)} % throttle on a 4S pack (≈15.2 V loaded). Motor efficiency ${n(op.efficiency * 100, 3)} %.`,
          `Four rotors draw ${n(4 * op.electricalPower, 3)} W; with ESC losses and about 7 W of avionics, roughly ${n((4 * op.electricalPower) / 0.95 + 7, 3)} W from the battery.`,
        ],
      };
    },
    calculator: 'motor',
    practical: [
      'Use measured C_T and C_P (for example from the UIUC Propeller Data Site) for the exact propeller, and cite them.',
      'Check the motor datasheet current limit and the ESC rating against the full-throttle current, not just hover.',
      'Enter the battery’s measured internal resistance; it grows as the pack ages and in the cold.',
      'Re-check the match at the highest, hottest operating site.',
    ],
    mistakes: [
      'Choosing a high-K_v motor for a large propeller: it needs high current and runs hot.',
      'Ignoring voltage sag: a nearly empty pack under load may not reach full-throttle thrust.',
      'Counting the rated capacity as fully usable.',
      'Using sea-level numbers for a mountain or hot-day operation.',
    ],
    quiz: [
      {
        question: 'At constant thrust, the propeller diameter is increased by 10 %. The required speed n changes by about:',
        options: ['−21 %', '−17 %', '−10 %', '+10 %'],
        answer: 1,
        explanation: 'n ∝ D⁻² at constant thrust: 1.1⁻² = 0.826, about −17 %.',
      },
      {
        question: 'A motor has K_v = 1000 rpm/V. Its torque constant K_t is about:',
        options: ['0.0095 N·m/A', '0.105 N·m/A', '1.05 N·m/A', '9.55 N·m/A'],
        answer: 0,
        explanation: 'K_t = 60/(2π × 1000) = 0.00955 N·m/A.',
      },
      {
        question: 'Why does hover need more power on a hot day at high altitude?',
        options: ['Gravity is stronger', 'The air is less dense, so the propeller must spin faster for the same thrust', 'The battery is lighter', 'The motor’s K_v rises'],
        answer: 1,
        explanation: 'T = C_T ρ n² D⁴: lower ρ needs higher n, and power grows with n³ (net ∝ 1/√ρ at constant thrust).',
      },
    ],
    references: [
      'J. B. Brandt, R. W. Deters, G. K. Ananda, O. D. Dantsker, M. S. Selig, UIUC Propeller Database, University of Illinois at Urbana-Champaign.',
      'Q. Quan, Introduction to Multicopter Design and Control, Springer, 2017 — chapter 4 (propulsion matching).',
      'J. G. Leishman, Principles of Helicopter Aerodynamics, 2nd ed., Cambridge University Press, 2006.',
    ],
  },
  {
    id: 'balloon-glidesonde',
    title: 'Balloon-launched glide-sondes: ascent, release, stall, glide',
    icon: 'balloon',
    level: 'Atmospheric research',
    minutes: 20,
    summary: 'How a latex balloon carries an aircraft to 33 km, why it falls before it can fly after release, and how a glide-sonde samples the atmosphere on the way down.',
    beginner: [
      'A sounding balloon rises because the gas inside is lighter than the air it displaces. As it climbs the outside pressure falls, the balloon swells, and at its burst diameter it pops — so the release must happen well below the burst altitude.',
      'At 33 km the air is about 1 % as dense as at sea level. When the aircraft is released it has almost no airspeed, so its wings cannot lift: it falls nose-down (the stall phase) until it is fast enough to pull out, which can take several hundred metres and speeds above 100 m/s.',
      'Then it glides, sinking slowly while its sensors measure temperature, humidity, pressure and wind. Because it sinks slower and slower as the air thickens, the vertical resolution of the measurements improves on the way down. A hybrid glide-sonde starts its motor near the end to fly back for recovery.',
    ],
    theory: [
      'Balloon lift: with the gas at ambient temperature and pressure, gross lift L = n_gas (M_air − M_gas) g is constant with height, while the volume V = n_gas R T/p grows. Free lift F = L − total weight drives the ascent: w = √(2F/(ρ C_D π r²)).',
      'Burst: the balloon bursts when its diameter reaches the burst diameter, so the burst altitude is where V(h) = π d³/6. More gas raises the ascent rate but lowers the burst altitude.',
      'After release the 2-D point-mass equations are m dV/dt = −D − W sin γ and m V dγ/dt = L − W cos γ. With L = C_L ½ρV² S limited by C_Lmax and the load-factor limit n_max, the drop ends when q is large enough to curve the path up to the glide angle.',
      'Steady glide at the best lift coefficient C_L* = √(C_D0/k) gives (L/D)max = 1/(2√(C_D0 k)) and airspeed V = √(2W/(ρ S C_L*)), which falls as density rises; the sink rate V/(L/D) falls with it.',
      'At 30 km the Reynolds number of a small wing is only about 20 000–50 000, where aerofoils behave very differently from the textbook; Mach number during the pull-out can reach 0.3–0.6. Both need low-Re aerofoil data and careful structural limits.',
    ],
    equations: [
      { expression: 'L_gross = n_gas (M_air − M_gas) g,   V = n_gas R T / p', note: 'Balloon lift and volume.' },
      { expression: 'w = √(2 F / (ρ C_D π r²))', note: 'Ascent rate from free lift F.' },
      { expression: 'm V̇ = −D − W sin γ,   m V γ̇ = L − W cos γ', note: 'Release and pull-out dynamics.' },
      { expression: '(L/D)max = 1 / (2 √(C_D0 k)),   k = 1/(π e AR)', note: 'Best glide.' },
      { expression: 'Δz = w_sink Δt_s', note: 'Sonde vertical resolution.' },
    ],
    variables: [
      { symbol: 'F', meaning: 'Free lift', unit: 'kg (as weighed), N in equations' },
      { symbol: 'd_burst', meaning: 'Burst diameter', unit: 'm' },
      { symbol: 'γ', meaning: 'Flight-path angle', unit: 'rad' },
      { symbol: 'n_max', meaning: 'Load-factor limit in the pull-out', unit: '—' },
      { symbol: 'w_sink', meaning: 'Sink rate', unit: 'm/s' },
    ],
    example: () => {
      const s = defaultSounding();
      const a = balloonAscent(s.params, 1.5, 'helium');
      return {
        title: 'A 1.5 kg glide-sonde on a 2000 g balloon',
        steps: [
          `Balloon 2.0 kg, flight train 0.25 kg, aircraft 1.5 kg, free lift 1.2 kg: gross lift ${n(a.grossLift, 3)} kg, neck lift ${n(a.neckLift, 3)} kg.`,
          `Helium needed: ${n(a.launchVolume, 3)} m³ (${n(a.gasMass * 1000, 3)} g of gas), launch diameter ${n(a.launchDiameter, 3)} m.`,
          `Ascent rate at launch ${n(a.launchRate, 3)} m/s; the model reaches 33 km in ${n(a.timeToRelease / 60, 3)} min.`,
          `Predicted burst at ${n((a.burstAltitude - s.params.launchElevation) / 1000, 3)} km above ground: only about 1 km above release, so a larger balloon or less free lift would give a safer margin.`,
          'The Balloon & Glide-Sonde page continues with the release, pull-out, glide and powered stages for your own design.',
        ],
      };
    },
    calculator: 'balloon',
    practical: [
      'Weigh the neck lift at the filler with a calibrated weight; free lift sets the ascent rate.',
      'Keep a burst margin of 3 km or more; balloons age and burst altitudes scatter.',
      'Use low-Reynolds-number aerofoil data for the glide and limit the pull-out load factor to what the structure has been tested for.',
      'Insulate and heat the battery and electronics: the stratosphere is around −45 °C to −60 °C.',
      'Obtain airspace clearance and plan recovery areas from wind-aware predictions.',
    ],
    mistakes: [
      'Releasing too close to the predicted burst altitude.',
      'Using sea-level aerofoil data at Re ≈ 20 000.',
      'Forgetting that avionics drain the battery throughout the ascent and glide, before the powered stage.',
      'Ignoring Mach number during the stall drop in thin air.',
    ],
    quiz: [
      {
        question: 'Why does the balloon’s gross lift stay nearly constant as it rises?',
        options: ['Gravity weakens', 'The gas expands so it always displaces the same mass of air', 'The balloon gets lighter', 'Temperature is constant'],
        answer: 1,
        explanation: 'With the gas at ambient p and T, the displaced air mass equals n_gas M_air at every altitude.',
      },
      {
        question: 'Right after release at 33 km the aircraft:',
        options: ['Glides immediately', 'Falls nose-down until dynamic pressure allows a pull-out', 'Climbs', 'Hovers'],
        answer: 1,
        explanation: 'With almost no airspeed q ≈ 0, so lift is negligible until the drop builds speed.',
      },
      {
        question: 'Sink rate halves while the sample interval stays 1 s. The vertical resolution:',
        options: ['Doubles (worse)', 'Halves (finer)', 'Stays the same', 'Depends on the balloon'],
        answer: 1,
        explanation: 'Δz = w_sink Δt: half the sink rate gives half the spacing between samples.',
      },
    ],
    references: [
      'J. D. Anderson, Introduction to Flight — gliding flight and the standard atmosphere.',
      'Cambridge University Spaceflight / SondeHub, Tawhiri balloon flight predictor documentation.',
      'M. S. Selig et al., Summary of Low-Speed Airfoil Data (UIUC) — low-Reynolds-number aerofoil behaviour.',
    ],
  },
  {
    id: 'aerodynamics-stability',
    title: 'Wing aerodynamics, drag and balance',
    icon: 'airfoil',
    level: 'Aerodynamics',
    minutes: 25,
    summary: 'How a finite wing makes lift, where drag comes from, how fast the aircraft stalls, which speeds give best range and endurance, and where the centre of gravity must be.',
    beginner: [
      'A wing makes lift by turning the air downwards. A finite wing leaks air round its tips, which tilts the lift backwards: that tilt is induced drag, and it is smaller for long, slender (high aspect-ratio) wings.',
      'The rest of the drag is mostly skin friction on every surface the air touches, increased by the shape (thickness) of each part. Adding up each part gives the zero-lift drag C_D0.',
      'The stall speed is the slowest speed at which the wing can carry the weight. Best range comes at the speed of best lift-to-drag ratio; best endurance a little slower, at minimum power.',
      'For stability in pitch the centre of gravity must be ahead of the neutral point (the aircraft’s overall aerodynamic centre). The gap, as a fraction of the mean chord, is the static margin: 5–15 % is typical.',
    ],
    theory: [
      'Prandtl’s lifting-line theory represents the wing by a bound vortex whose strength varies along the span. Glauert wrote the circulation as a Fourier sine series Γ = 2bV Σ A_n sin nθ; requiring every section to satisfy its own lift curve gives linear equations for the A_n. Then C_L = π AR A₁ and the span efficiency is e = 1/(1 + δ) with δ = Σ n (A_n/A₁)². An elliptical planform gives e = 1; a taper ratio near 0.4 comes close.',
      'Sweep reduces the lift-curve slope; the DATCOM/Helmbold expression C_Lα = 2π AR / (2 + √(AR²(1 + tan²Λ_c/2)/κ² + 4)) captures it, κ = a₀/2π.',
      'Zero-lift drag by component build-up (Raymer): C_D0 = Σ C_f FF Q S_wet / S. Skin friction is laminar (1.328/√Re) or turbulent (0.455/(log₁₀ Re)^2.58); the form factor FF grows with thickness for surfaces and with bluntness for bodies; Q accounts for interference.',
      'Parabolic polar: C_D = C_D0 + k C_L², k = 1/(π AR e) with a viscous Oswald factor (Kroo: 1/e = 1/e_inv + 0.38 C_D0 π AR). Then (L/D)max = ½√(π AR e / C_D0) at C_L* = √(C_D0/k).',
      'Neutral point: h_n = h_ac + η V_H (a_t/a_w)(1 − dε/dα) − (fuselage term). Static margin SM = h_n − h_cg. A tailless wing has V_H = 0 and must use a reflexed aerofoil (c_m0 ≥ 0) or sweep with washout to trim.',
    ],
    equations: [
      { expression: 'C_L = π AR A₁,   e = 1/(1 + Σ n (A_n/A₁)²)', note: 'Lifting line (Glauert).' },
      { expression: 'C_D0 = Σ C_f FF Q S_wet / S', note: 'Component drag build-up.' },
      { expression: 'C_D = C_D0 + C_L²/(π AR e)', note: 'Parabolic drag polar.' },
      { expression: 'V_s = √(2W/(ρ S C_Lmax))', note: 'Stall speed.' },
      { expression: 'SM = (x_np − x_cg)/c̄', note: 'Static margin.' },
    ],
    variables: [
      { symbol: 'AR', meaning: 'Aspect ratio b²/S', unit: '—' },
      { symbol: 'e', meaning: 'Oswald (span) efficiency', unit: '—' },
      { symbol: 'C_f, FF, Q', meaning: 'Skin friction, form factor, interference', unit: '—' },
      { symbol: 'S_wet', meaning: 'Wetted area', unit: 'm²' },
      { symbol: 'V_H', meaning: 'Horizontal tail volume coefficient', unit: '—' },
      { symbol: 'x_np, x_cg', meaning: 'Neutral point and CG behind the nose', unit: 'm' },
    ],
    example: () => {
      const ll = liftingLine({ span: 2, rootChord: 0.3, taperRatio: 0.6, a0: 6 });
      const S = (2 * 0.3 * 1.6) / 2;
      const AR = 4 / S;
      const e = 1 / (1 / ll.e + 0.38 * 0.025 * Math.PI * AR);
      const k = 1 / (Math.PI * AR * e);
      const W = 3 * 9.80665;
      const vs = Math.sqrt((2 * W) / (1.19 * S * 1.2));
      return {
        title: 'A 3 kg survey aircraft with a 2 m tapered wing',
        steps: [
          `S = b c_r (1 + λ)/2 = 2 × 0.3 × 1.6 / 2 = ${n(S, 3)} m², AR = b²/S = ${n(AR, 3)}.`,
          `Lifting line (taper 0.6, a₀ = 6/rad): span efficiency e_LL = ${n(ll.e, 4)}, lift slope C_Lα = ${n(ll.cla, 3)} per rad.`,
          `With C_D0 = 0.025, the Oswald factor is e = 1/(1/${n(ll.e, 3)} + 0.38 × 0.025 × π × ${n(AR, 3)}) = ${n(e, 3)}, so k = ${n(k, 3)}.`,
          `(L/D)max = ½ √(1/(C_D0 k)) = ${n(0.5 * Math.sqrt(1 / (0.025 * k)), 3)} at C_L* = ${n(Math.sqrt(0.025 / k), 3)}.`,
          `At 300 m (ρ ≈ 1.19 kg/m³) with C_Lmax = 1.2: V_s = √(2W/(ρ S C_Lmax)) = ${n(vs, 3)} m/s; cruise at 1.3 V_s or more, i.e. above ${n(1.3 * vs, 3)} m/s.`,
        ],
      };
    },
    calculator: 'polar',
    practical: [
      'Run the actual aerofoil in XFLR5 at your cruise Reynolds number and enter its c_l,max, α₀ and c_m0.',
      'Measure the CG on the assembled aircraft (balance it on two fingers or with two scales) and enter it.',
      'Expect 20–50 % more drag than a clean build-up on a hand-built airframe: antennas, gaps and rough skins add up.',
      'Low Reynolds number (below 100 000) brings laminar bubbles: c_l,max falls and drag rises.',
    ],
    mistakes: [
      'Putting the CG behind the neutral point: the aircraft diverges in pitch.',
      'Using a cambered (nose-down c_m0) aerofoil on a tailless wing.',
      'Cruising close to stall to save power, leaving no margin for gusts and turns.',
      'Taking sea-level aerofoil data for a high-altitude or very small aircraft.',
    ],
    quiz: [
      {
        question: 'Doubling the aspect ratio at the same C_L and e roughly:',
        options: ['Doubles induced drag', 'Halves induced drag', 'Leaves induced drag unchanged', 'Removes skin friction'],
        answer: 1,
        explanation: 'C_Di = C_L²/(π AR e): induced drag is inversely proportional to AR.',
      },
      {
        question: 'The CG is moved backwards towards the neutral point. The static margin:',
        options: ['Increases', 'Decreases', 'Does not change', 'Becomes the stall speed'],
        answer: 1,
        explanation: 'SM = (x_np − x_cg)/c̄ falls as x_cg approaches x_np; at zero the aircraft is neutrally stable.',
      },
      {
        question: 'Best endurance for a propeller aircraft is flown at:',
        options: ['The stall speed', 'Minimum power speed V_mp, slower than best L/D', 'Top speed', 'Twice V_md'],
        answer: 1,
        explanation: 'Endurance is maximised by minimum power D·V, at V_md/3^¼ in a parabolic polar.',
      },
    ],
    references: [
      'J. D. Anderson, Fundamentals of Aerodynamics — lifting-line theory (Glauert’s method).',
      'D. P. Raymer, Aircraft Design: A Conceptual Approach — ch. 12 drag build-up, ch. 16 stability.',
      'R. C. Nelson, Flight Stability and Automatic Control — static longitudinal stability.',
      'I. Kroo, Aircraft Design: Synthesis and Analysis (Stanford) — Oswald efficiency estimate.',
    ],
  },
  {
    id: 'structures-sizing',
    title: 'Sizing spars and arms',
    icon: 'truss',
    level: 'Structures',
    minutes: 20,
    summary: 'The loads that bend a wing spar and a multirotor arm, how stress, deflection and vibration follow from the tube size and material, and how safety factors are applied.',
    beginner: [
      'A wing in a pull-up carries several times the aircraft weight. That load bends the wing; the biggest bending moment is at the root, where the spar must be strongest.',
      'A multirotor arm is a cantilever with the motor thrust at its tip. It must be strong enough at full throttle and stiff enough that it does not wobble.',
      'Every arm has a natural frequency. If the propeller’s rotation (or its blades passing) shakes it at that frequency, it resonates and the flight controller sees noise. Stiff, short arms with light motors keep the frequency high.',
      'Designs use limit loads (the most expected in service) multiplied by a safety factor, 1.5 for aircraft, to get the ultimate loads the structure must survive.',
    ],
    theory: [
      'Elliptical lift on each half wing has its centroid at 4(b/2)/(3π) from the root, so the root bending moment is M = n W b/(3π).',
      'Bending stress in a round tube: σ = M c / I with c = D/2 and I = π (D⁴ − d⁴)/64. Thin-walled tubes put material far from the centre, where it works hardest.',
      'Cantilever deflection: tip load F gives δ = F L³/(3EI); a uniform load w gives δ = w L⁴/(8EI). Stiffness scales with E·I, strength with σ_allow·I/c.',
      'First bending frequency with a tip mass (Rayleigh): f₁ = (1/2π)√(3EI/(L³(m_tip + 0.24 m_arm))). Compare it with the rotor frequency 1P = rpm/60 and blade passing 2P for a two-blade propeller; stay at least 15 % away, ideally above 2P.',
      'The margin of safety MS = σ_allow/σ_ultimate − 1 must be zero or positive. Composite allowables depend on lay-up, temperature and damage; use tested values.',
    ],
    equations: [
      { expression: 'M_root = n W b / (3π)', note: 'Elliptical lift.' },
      { expression: 'σ = M (D/2) / I,   I = π (D⁴ − d⁴)/64', note: 'Bending of a tube.' },
      { expression: 'δ = F L³/(3EI)', note: 'Tip-loaded cantilever.' },
      { expression: 'f₁ = (1/2π) √(3EI / (L³ (m_tip + 0.24 m_arm)))', note: 'Arm with a motor at the tip.' },
    ],
    variables: [
      { symbol: 'n', meaning: 'Load factor', unit: '—' },
      { symbol: 'E', meaning: 'Young’s modulus', unit: 'Pa' },
      { symbol: 'I', meaning: 'Second moment of area', unit: 'm⁴' },
      { symbol: 'σ_allow', meaning: 'Allowable stress', unit: 'Pa' },
      { symbol: 'f₁', meaning: 'First bending frequency', unit: 'Hz' },
    ],
    example: () => {
      const cf = MATERIALS[0];
      const c = armCheck({ thrust: 15, length: 0.2, tipMass: 0.08, safetyFactor: 1.5, material: cf, outer: 0.012, wall: 0.001, rotorHz: 100 });
      return {
        title: 'A 200 mm carbon arm, 12 × 1 mm tube, 15 N full thrust',
        steps: [
          `I = π (12⁴ − 10⁴)/64 mm⁴ = ${n(c.section.I * 1e12, 4)} mm⁴.`,
          `Ultimate moment 1.5 × 15 N × 0.2 m = 4.5 N·m gives σ = ${n(c.stress / 1e6, 3)} MPa against ${n(cf.strength / 1e6, 3)} MPa allowable: margin ${n(c.margin * 100, 3)} %.`,
          `Tip deflection at full thrust δ = F L³/(3EI) = ${n(c.deflection * 1000, 3)} mm.`,
          `With an 80 g motor and propeller, f₁ = ${n(c.frequency, 3)} Hz${c.resonance ? `, within 15 % of ${c.resonance}: stiffen it` : ''}. At 6 000 rpm hover, 1P = 100 Hz and 2P = 200 Hz.`,
        ],
      };
    },
    calculator: 'beam',
    practical: [
      'Check joints and clamps, not only tubes: most failures start at holes, bonds and clamps.',
      'Use tested allowables at the coldest and hottest operating temperatures (the stratosphere is near −55 °C).',
      'Load-test the wing to the limit load (sandbag test) before flight.',
      'Add soft mounts for the flight controller if the arm frequency is close to the rotor frequencies.',
    ],
    mistakes: [
      'Sizing for hover thrust instead of full-throttle thrust.',
      'Forgetting the balloon-release pull-out load on a glide-sonde.',
      'Counting the whole tube wall in a split or drilled section.',
      'Treating the safety factor as an excuse for unknown material data.',
    ],
    quiz: [
      {
        question: 'Doubling the arm length with the same tube and tip load makes the tip deflection:',
        options: ['Twice as large', 'Four times as large', 'Eight times as large', 'Unchanged'],
        answer: 2,
        explanation: 'δ = F L³/(3EI): deflection scales with L³.',
      },
      {
        question: 'Ultimate load is:',
        options: ['The weight', 'Limit load × safety factor', 'Half the limit load', 'The yield stress'],
        answer: 1,
        explanation: 'The structure must survive the limit load multiplied by the safety factor (1.5) without failure.',
      },
      {
        question: 'An arm’s first frequency is 98 Hz and the rotor runs at 100 Hz in hover. You should:',
        options: ['Fly as is', 'Stiffen or shorten the arm, or lighten the motor', 'Use a heavier motor', 'Lower the safety factor'],
        answer: 1,
        explanation: 'It is within 15 % of 1P and will resonate; raise f₁ by more stiffness or less tip mass.',
      },
    ],
    references: [
      'T. H. G. Megson, Aircraft Structures for Engineering Students — wing bending.',
      'W. C. Young, R. G. Budynas, Roark’s Formulas for Stress and Strain — beams and sections.',
      'R. D. Blevins, Formulas for Natural Frequency and Mode Shape — cantilever with tip mass.',
    ],
  },
]);

export const LEARNING_PATHS = Object.freeze([
  { title: 'Engineering foundations', lessons: ['data-provenance', 'si-units', 'standard-atmosphere'], status: 'available' },
  { title: 'UAV configuration fundamentals', lessons: ['rotor-layout-hover', 'wing-planform-tail'], status: 'available' },
  { title: 'Electronics, flight controllers and avionics', lessons: ['avionics-power-interfaces'], status: 'available' },
  { title: 'Propulsion, motors and batteries', lessons: ['propulsion-energy'], status: 'available' },
  { title: 'Stratospheric sounding and glide-sondes', lessons: ['balloon-glidesonde'], status: 'available' },
  { title: 'RF links and software-defined radio', build: 7 },
  { title: 'Aerodynamics and structures', lessons: ['aerodynamics-stability', 'structures-sizing'], status: 'available' },
  { title: 'Flight dynamics and control', build: 6 },
  { title: 'Computer vision and sensor fusion', build: 8 },
  { title: 'Navigation, autonomy and edge AI', build: 9 },
  { title: 'Digital twins', build: 10 },
  { title: 'Micro aerial vehicles', build: 6 },
]);

export function getLesson(id) {
  return LESSONS.find((lesson) => lesson.id === id) ?? null;
}
