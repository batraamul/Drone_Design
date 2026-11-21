# Engineering models

This file documents every engineering model implemented in AEROLAB X: equations, variables, SI units, assumptions, validity range, provenance, references and the tests that validate it. A model may only be used by a module once it is documented here.

Build 1 models: unit system, provenance taxonomy, International Standard Atmosphere, requirement-consistency checks.

---

## 1. Unit system — `js/engineering/units.js`

- All quantities are stored in SI units: kg, m, s, A, K and derived units (N, J, W, Pa, C, V, Ω, rad, …).
- Conversion happens only at the user-interface boundary, explicitly, with the unit shown next to every value.
- Multiplicative units are defined by an exact factor to SI where an exact definition exists (1 ft = 0.3048 m, 1 lb = 0.45359237 kg, 1 kn = 1852/3600 m/s, 1 Wh = 3600 J, 1 mAh = 3.6 C, 1 kgf = 9.80665 N, 1 atm = 101 325 Pa, 1 psi = 6894.757293168 Pa).
- Temperature is affine: K = °C + 273.15; K = (°F − 32)·5/9 + 273.15.
- Conversions between different dimensions, unknown units and non-finite numbers throw `UnitError`.

**Validation:** `tests/engineering/units.test.mjs` — exact definitions, battery charge/energy, pressure, affine temperature round-trips, angular units, round trip for every unit, error cases.

## 2. Provenance and model fidelity — `js/engineering/provenance.js`

| Label | Meaning |
|---|---|
| Requirement (REQ) | Target or constraint set by the user; not a property of the design |
| User input (USER) | Design parameter entered by the user, not checked against hardware |
| Assumption (ASSUME) | Value assumed to proceed (e.g. an efficiency); must be revisited |
| Illustrative (ILLUS) | Example data for learning; describes no real product |
| Datasheet (DATA) | From a manufacturer datasheet; source reference required |
| Conceptual estimate (EST) | Rule-of-thumb/statistical estimate; large uncertainty |
| Analytical calculation (CALC) | Closed-form calculation from documented equations and assumptions |
| Numerical simulation (SIM) | Output of a documented numerical model; not measured |
| Measured (MEAS) | Measured on hardware; test reference required |
| Experimentally validated (VALID) | Model result confirmed by measurement within a stated tolerance and range |

## 3. International Standard Atmosphere — `js/engineering/atmosphere.js`

**Model:** U.S. Standard Atmosphere 1976 (identical to the ICAO Standard Atmosphere below 32 km), seven geopotential layers from −5 km to 84.852 km geopotential (≈ 86 km geometric).

**Equations**

| Quantity | Equation |
|---|---|
| Geopotential altitude | H = r₀·z / (r₀ + z) |
| Temperature | T = T_b + L·(H − H_b) |
| Pressure, gradient layer (L ≠ 0) | p = p_b·(T/T_b)^(−g₀/(R·L)) |
| Pressure, isothermal layer (L = 0) | p = p_b·exp(−g₀·(H − H_b)/(R·T_b)) |
| Density | ρ = p/(R·T) |
| Speed of sound | a = √(γ·R·T) |
| Dynamic viscosity (Sutherland) | μ = β·T^1.5/(T + S) |
| Kinematic viscosity | ν = μ/ρ |
| Density altitude (troposphere) | H_ρ = (T₀/|L|)·(1 − (ρ/ρ₀)^(1/(g₀/(R·|L|) − 1))) |
| Non-standard day (pressure altitude) | p = p_ISA(H), T = T_ISA(H) + ΔT, ρ = p/(R·T) |

**Constants:** g₀ = 9.80665 m/s²; R = 287.05287 J/(kg·K) (= R*/M₀ = 8.31432/0.0289644); γ = 1.4; T₀ = 288.15 K; p₀ = 101 325 Pa; ρ₀ = p₀/(R·T₀) ≈ 1.2250 kg/m³; r₀ = 6 356 766 m; β = 1.458×10⁻⁶ kg/(m·s·K^½); S = 110.4 K.

**Layers** (base geopotential altitude, lapse rate): 0 km −6.5 K/km; 11 km 0; 20 km +1.0 K/km; 32 km +2.8 K/km; 47 km 0; 51 km −2.8 K/km; 71 km −2.0 K/km; top 84.852 km. Base temperatures and pressures are computed by integrating upward from sea level.

**Assumptions and validity:** dry air, ideal gas, hydrostatic equilibrium, standard gravity; valid for −5 km ≤ z ≤ ≈86 km. ISA is a reference atmosphere, not a forecast; site work should use measured soundings or weather-model data. Density altitude is provided only in the troposphere.

**Provenance:** analytical (standard model).

**Validation:** `tests/engineering/atmosphere.test.mjs` compares the model with the U.S. Standard Atmosphere 1976 tables at all seven layer bases:

| H (geopotential) | T (K) | p (Pa) table | ρ (kg/m³) table | Tolerance |
|---|---|---|---|---|
| 0 m | 288.15 | 101 325 | 1.2250 | p 1e-5, ρ 2e-4 (relative) |
| 11 000 m | 216.65 | 22 632.06 | 0.3639176 | ″ |
| 20 000 m | 216.65 | 5 474.889 | 0.08803486 | ″ |
| 32 000 m | 228.65 | 868.0187 | 0.01322497 | ″ |
| 47 000 m | 270.65 | 110.9063 | 0.001427527 | ″ |
| 51 000 m | 270.65 | 66.93887 | 0.0008616011 | ″ |
| 71 000 m | 214.65 | 3.956420 | 0.00006421 | ″ |

Also tested: sea-level speed of sound (340.294 m/s) and viscosity (1.7894×10⁻⁵ Pa·s), 1000 m point, geometric/geopotential conversion, ΔT behaviour, density-altitude inversion, range errors.

**References:** U.S. Standard Atmosphere, 1976 (NOAA-S/T 76-1562); ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere, 3rd ed., 1993.

## 4. Requirement-consistency checks — `js/engineering/requirements.js`

Requirements are user-set targets (provenance: requirement), stored in SI. The checks test whether the targets are consistent with each other using exact kinematics or the ISA model. They do **not** assess whether a particular design meets them; that requires the propulsion, energy and aerodynamic models of Builds 4–5.

| ID | Severity | Condition | Equation | Assumptions |
|---|---|---|---|---|
| REQ-MASS-001 | error | Payload target not less than take-off mass limit | m_pl < m_TO required | All masses are targets |
| REQ-PERF-001 | warning | Endurance shorter than the time to fly the range | t_E ≥ t_R = R/V_c | Still air; straight and level at cruise airspeed; no take-off, climb, descent, loiter or reserve |
| REQ-WIND-001 | warning | Wind speed ≥ cruise airspeed | V_g,upwind = V_c − V_w ≤ 0 | Wind along the flight path; constant airspeed |
| REQ-WIND-002 | warning | Endurance covers the range in still air but not in maximum wind | t_E ≥ k_w·R/V_c | Out-and-back route along the wind direction |
| REQ-ATM-001 | info | ISA density ratio at operating altitude < 0.8 | T_rotor ∝ ρ·n²·D⁴; L = ½ρV²SC_L | ISA standard day |

**Derived values:** payload fraction f_pl = m_pl/m_TO; minimum still-air flight time t_R = R/V_c; out-and-back wind factor k_w = 1/(1 − (V_w/V_c)²) (derivation: legs of R/2 at V_c − V_w and V_c + V_w give t = R·V_c/(V_c² − V_w²)); ISA density, density ratio and temperature at the operating altitude.

Invalid stored values (failing field validation) are ignored by the checks rather than used.

**Validation:** `tests/engineering/requirements.test.mjs` (each check triggers exactly at its boundary; derived values match hand calculations, e.g. 20 km at 15 m/s ⇒ 1333.3 s; V_w/V_c = 0.5 ⇒ k_w = 4/3; ISA density at 200 m ≈ 1.2016 kg/m³).

## 5. Planned models (not implemented)

Mass and CG budgets (Build 4/5), BLDC motor and propeller models (Build 4), battery equivalent-circuit model (Build 4), wing and airfoil estimates (Build 5), beam bending/torsion and vibration (Build 5), rigid-body dynamics and control (Build 6), camera geometry and GSD (Build 7), mission energy (Build 7). Each will be added to this document, with tests, before it is used.
