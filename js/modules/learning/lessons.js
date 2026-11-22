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
]);

export const LEARNING_PATHS = Object.freeze([
  { title: 'Engineering foundations', lessons: ['data-provenance', 'si-units', 'standard-atmosphere'], status: 'available' },
  { title: 'UAV configuration fundamentals', lessons: ['rotor-layout-hover', 'wing-planform-tail'], status: 'available' },
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
