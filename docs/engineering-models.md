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

## 5. Conceptual geometry — `js/engineering/configuration.js`, `js/engineering/geometry.js` (Build 2)

**Configuration.** `project.modules.configuration = { layout, options, params }`. The 24 layouts each belong to one category and one geometry family:
- `multirotor`;
- `fixed-wing`;
- `vtol`, which is wing geometry plus lift rotors;
- `none`, which is recorded only and not modelled (balloon-assisted, flapping-wing).

Each parameter has an SI unit, a validity range and help text. Starting values are *illustrative*. Every parameter has provenance `user-input`.

**Body frame.** x forward, y right, z up (m). Multirotor origin: frame centre. Winged origin: fuselage nose, so the aircraft lies at x ≤ 0.

### 5.1 Multirotor
| Quantity | Equation | Provenance |
|---|---|---|
| Rotor axes, X pattern | φᵢ = π/n + 2πi/n, (x, y) = R(cos φ, sin φ) | user-input |
| Rotor axes, + pattern | φᵢ = 2πi/n | user-input |
| Rotor axes, Y (tri, Y6) | φ = 60°, 180°, 300° | user-input |
| Rotor axes, H | x = ±R k/√(1+k²), y = ±R/√(1+k²), k = length/width | user-input |
| Wheelbase | W = max ‖rᵢ − rⱼ‖ | analytical |
| Tip clearance | c_tip = min ‖rᵢ − rⱼ‖ − D (regular ring: 2R sin(π/n) − D) | analytical |
| Disc area | A = n_axes · πD²/4 (a coaxial pair counts once) | analytical |
| Disc loading | DL = m_TO g₀ / A | analytical |
| Ideal induced velocity | v_h = √(DL / 2ρ) | analytical (momentum theory) |
| Ideal hover power | P_ideal = m_TO g₀ v_h | analytical; lower bound (figure of merit = 1) |

ρ is the ISA density at the operating-altitude target, or at sea level when no target is set. Spin directions alternate around the ring; coaxial pairs counter-rotate.

| Check | Condition | Severity |
|---|---|---|
| GEO-MR-001 | c_tip < 0 | error |
| GEO-MR-002 | 0 ≤ c_tip < 0.1 D | warning (rule of thumb) |
| GEO-MR-003 | R − D/2 < d_b/2 | warning (disc over the body) |

### 5.2 Wing, fuselage and tail
| Quantity | Equation |
|---|---|
| Tip chord | c_t = λ c_r |
| Reference area | S = b (c_r + c_t)/2 |
| Aspect ratio | AR = b²/S |
| Mean aerodynamic chord | c̄ = (2/3) c_r (1+λ+λ²)/(1+λ) |
| MAC position | ȳ = (b/6)(1+2λ)/(1+λ), x_LE,MAC = ȳ tan Λ_LE |
| Quarter-chord sweep | tan Λ_c/4 = tan Λ_LE − (1−λ)/(AR(1+λ)) |
| Aerodynamic centre | x_ac = x_w + ȳ tan Λ_LE + 0.25 c̄ (conceptual estimate: subsonic, thin aerofoil) |
| Wing loading | W/S = m_TO g₀ / S |
| Conventional tail | S_h = b_h c_h, S_v = h_v c_v |
| V-tail | S_V = b_h c_h / cos Γ_v, S_h = S_V cos²Γ_v, S_v = S_V sin²Γ_v |
| Tail volume coefficients | V_H = S_h l_t /(S c̄), V_V = S_v l_t /(S b) |

The tail arm l_t is measured from the wing aerodynamic centre to the tail quarter-chord.

| Check | Condition | Severity |
|---|---|---|
| GEO-TAIL-001 | V_H < 0.3 | warning |
| GEO-TAIL-002 | V_H > 1.2 | info |
| GEO-TAIL-003 | V_V < 0.015 | warning |
| GEO-TAIL-004 | tail leading edge ahead of the wing root trailing edge | error |
| GEO-FW-001 | AR < 3 (not for delta or VTOL layouts) | info |

The typical tail-volume ranges are about 0.4–0.7 for V_H and 0.02–0.05 for V_V (Raymer, *Aircraft Design: A Conceptual Approach*, table 6.4). They are guidance from historical statistics, not stability limits. Stability is analysed in Build 6.

### 5.3 VTOL lift systems
| Layout | Lift rotors | Notes |
|---|---|---|
| Quadplane | 4 lift rotors at (x_ac ± x_L, ±y_L) on two booms, analysed as in §5.1 | GEO-LIFT-004 warns when a disc reaches over the fuselage |
| Tilt-rotor (tri) | Two wing-tip rotors drawn in hover, plus one rear rotor drawn at 0.8 D_L | The disc area uses D_L for all three, which is an upper bound |
| Tailsitter | 4 rotors on the leading edge at (±b/4, ±0.6 D_L) in the hover plane, axis along x | Spacing is checked in the hover plane |

**Verification.** `tests/engineering/geometry.test.mjs` checks the following against hand calculations:
- rotor positions;
- the quad-X wheelbase, clearance, disc area, disc loading, v_h and P_ideal;
- the trapezoidal-wing area, AR, MAC, ȳ and quarter-chord sweep, including rectangular-wing limits;
- the tail volumes;
- the V-tail split (cos² + sin² = 1);
- the quadplane rotor placement.

It also checks that every layout's default is valid and raises no warnings.

**Limitations.** Plan-form geometry only:
- no aerofoil thickness, twist or incidence;
- no mass or CG estimate;
- no aerodynamic coefficients;
- no rotor-rotor or rotor-wing interference;
- no structural sizing.

Ideal hover power ignores every loss.

## 6. Electrical architecture — `js/engineering/components.js`, `electrical.js`, `catalogue.js` (Build 3)

**Data.** `project.modules.components = { items, connections }`.
- Each component has a type, quantity, provenance (`illustrative`, `datasheet`, `user-input` or `measured`), a source reference, SI specifications and port counts.
- Each connection is a power link or a data link (`uart`, `i2c`, `spi`, `can`, `pwm`, `usb`, `ethernet`).
- Power links run from supplier to consumer.

**Rails.**
- Battery of n cells: [n V_cell,min, n V_cell,max] with nominal n V_cell,nom.

  | Chemistry | min (V) | nominal (V) | max (V) |
  |---|---|---|---|
  | LiPo | 3.3 | 3.7 | 4.2 |
  | LiPo HV | 3.3 | 3.8 | 4.35 |
  | Li-ion | 2.8 | 3.6 | 4.2 |

  The minima are loaded, near-empty values.
- A regulator supplies [V_out, V_out].
- A flight controller with an output within 0.5 V of its input is a pass-through: its rail equals its input rail and the current passes unchanged. Otherwise it is an on-board converter with an assumed η = 0.85.

**Loads (worst case, all consumers at maximum at once).**

| Quantity | Equation |
|---|---|
| Consumer current | I = I_max × quantity (ESC: the user's operating-current estimate × quantity) |
| Converter input current | I_in = I_q + V_out ΣI_out / (η V_in,min) |
| Battery current | I_batt = Σ input currents of everything on the battery |
| Battery power | P_batt = I_batt V_nom |
| Battery life at constant load | t = Q V_nom / P_batt (no reserve, ideal capacity) |

**Checks.**

| ID | Rule | Severity |
|---|---|---|
| AV-PWR-000 | Power connections form a loop | error |
| AV-PWR-001 | V_rail,max > V_supply,max (over-voltage) | error |
| AV-PWR-002 | V_rail,min < V_supply,min (brown-out risk) | warning |
| AV-PWR-003 | ΣI_load > I_rated | error |
| AV-PWR-004 | ΣI_load > 0.8 I_rated (derating guideline) | warning |
| AV-PWR-005 | Consumer without a power connection | warning |
| AV-PWR-006 | Power drawn from a part without an output | error |
| AV-PWR-007 | ESC without a current estimate (propulsion excluded) | info |
| AV-PWR-008 | More than one supply (back-feed caution) | info |
| AV-IF-001 | Link kind missing on one end | error |
| AV-IF-002 | Point-to-point links exceed available ports (PWM counts one channel per unit) | error |
| AV-IF-003 | Logic levels differ and the lower-level input is not 5 V tolerant (UART, I²C, SPI, PWM) | error |
| AV-IF-004 | ESC or peripheral without a data or control link | warning |
| AV-DATA-001 | Datasheet or measured component without a source reference | warning |
| AV-DATA-002 | Illustrative catalogue values in use | info |

**Catalogue.**
- Every built-in entry is named "Example …" and labelled `illustrative`, with typical rounded values.
- No real product or manufacturer value is reproduced.
- A test enforces both rules.

**Verification.** `tests/engineering/electrical.test.mjs` checks:
- battery rail limits;
- the pass-through rail;
- the power-module load (1.07 A) and input current 0.01 + 5.3 × 1.07/(0.9 × 13.2) A, by hand;
- that ESC estimates enter the budget;
- that every check fires on a minimal case;
- that the example set is free of errors and warnings;
- sanitisation.

**Limitations.**
- Steady-state, worst-case currents only. No transients, inrush, cable losses, regulator thermal limits or ground loops.
- The motor current comes from the user's estimate until the propulsion models of Build 4.
- The link budget and SDR visualisations follow in Build 7.

## 7. Propulsion, battery, mass and endurance — `js/engineering/propulsion.js` (Build 4)

**Data.** `project.modules.propulsion`:
- `motor`: name, catalogue id, provenance, source, and `specs` {kv rpm/V, resistance Ω, noLoadCurrent A, maxCurrent A, mass kg};
- `propeller`: the same metadata, with `specs` {diameter of the data, pitch, ct, cp, mass};
- `batteryId`;
- `settings` {structureMass, usableFraction, escEfficiency, isaDeltaT, cruiseLD, cruisePropEfficiency, cruiseMotorEfficiency}.

The propeller diameter used in every calculation is the one in the configuration (§5). The propeller entry supplies only coefficients, pitch and mass, and a warning (PR-PROP-001) appears if its data diameter differs by more than 8 %.

**Air.** ISA at the operating-altitude target with ΔT (hot day): ρ = p/(R T).

| Quantity | Equation |
|---|---|
| Hover thrust per lift rotor | T = m_est g₀ / n_lift |
| Propeller speed | n = √(T/(C_T ρ D⁴)) (rev/s, UIUC convention) |
| Shaft power | P = C_P ρ n³ D⁵ (× 1.2 for coaxial pairs: Leishman's interference factor, about 1.16–1.28) |
| Torque | Q = P/(2π n) |
| Motor | K_t = 60/(2π K_v), I = Q/K_t + I₀, V = 60 n/K_v + I R, η = P/(V I) |
| Total hover power | P_hover = n V I/η_ESC + P_avionics (P_avionics from §6) |
| Battery | V_oc = n_cells × OCV(SOC) (typical per-cell curves for LiPo, LiPo HV and Li-ion); R_pack from the datasheet, else ≈ n_cells k/C[Ah] with k = 0.015 Ω·Ah (LiPo) or 0.08 Ω·Ah (Li-ion) |
| Battery current | I = (V_oc − √(V_oc² − 4 R P))/(2R); infeasible if V_oc² < 4RP |
| Throttle | δ ≈ V_motor / V_terminal |
| Full-throttle thrust | bisection on n of 60n/K_v + R(Q(n)/K_t + I₀) = η_ESC V_terminal(end of usable capacity) |
| Endurance | time-stepped discharge dSOC/dt = −I/Q until SOC = 1 − f_use or the loaded cell voltage < V_min |
| Fixed-wing cruise (until Build 5) | T = W/(L/D), P = T V/(η_prop η_mot η_ESC) + P_avionics; range = V t |
| Mass budget | m_est = Σ components + n(m_motor + m_prop) + m_structure + m_payload |

**Checks.**

| ID | Rule | Severity |
|---|---|---|
| PR-MASS-001 | m_est > MTOW target | error |
| PR-HOV-001 | V_motor > V_terminal, or the battery cannot deliver the power | error |
| PR-HOV-002 | Hover throttle > 0.75 | warning |
| PR-HOV-003 | T/W < 1.5 (error if < 1.1) | warning |
| PR-MOT-001 | Hover current > motor rating | error |
| PR-MOT-002 | Full-throttle current > motor rating | warning |
| PR-ESC-001 | Full-throttle current > ESC rating | warning |
| PR-ESC-002 | ESC quantity ≠ motor count | info |
| PR-BAT-001 | Battery current > rating | error |
| PR-PROP-001 | Propeller data diameter differs from the drawing | warning |
| PR-PROP-002 | Figure of merit C_T^1.5/(√2 C_P) > 0.85 | warning |
| PR-CRU-001 | Static thrust < 0.3 W (fixed wing) | warning |
| PR-END-001 | Endurance below the requirement | warning |

**Verification.** `tests/engineering/propulsion.test.mjs` covers:
- the operating point by hand, and the solved speed reproducing the thrust;
- the full-throttle root satisfying the voltage equation;
- OCV interpolation and monotonic curves;
- the battery current satisfying I(V_oc − IR) = P;
- discharge time within 5 % of the energy estimate;
- every category's default;
- the mass-budget identity;
- every check firing, including hot-and-high needing more than 20 % extra power.

**Limitations.**
- Static propeller coefficients (no advance ratio) and constant internal resistance.
- No temperature or ageing of the battery, and no ESC or motor thermal model.
- The fixed-wing cruise uses estimated L/D and efficiencies until the aerodynamics of Build 5.

## 8. Balloon-launched glide-sonde mission — `js/engineering/sounding.js` (Build 13, early)

**Ascent.** The lifting gas is at ambient temperature and pressure (zero superpressure), with M_air = 0.0289644 kg/mol, M_He = 0.0040026 and M_H₂ = 0.00201588.

| Quantity | Equation |
|---|---|
| Gas amount | n_gas = L_gross/(M_air − M_gas), with L_gross = m_balloon + m_train + m_aircraft + F (kg) |
| Volume | V(z) = n_gas R T(z)/p(z) |
| Ascent rate | w = √(2 F g/(ρ C_D π r²)), r from V, C_D ≈ 0.3 |
| Burst | V(z_b) = π d_burst³/6 (bisection) |
| Time to release | t = Σ Δz/w |

Assumption: with constant C_D the model's ascent rate rises with height (w ∝ ρ^(−1/6)). Real balloons climb at a more nearly constant rate, so ascent times are indicative.

**Release, stall and pull-out, glide.**
- 2-D point mass, RK4 integration:
  - m V̇ = −D − W sin γ, m V γ̇ = L − W cos γ;
  - L = C_L q S, D = (C_D0 + k C_L²) q S, k = 1/(π e AR).
- Release from V = 1 m/s, γ ≈ −90° (nose down).
- Pull-out: C_L = min(C_Lmax, n_max W/(q S)) until γ reaches the equilibrium glide angle γ_eq = −atan(1/(L/D)).
- Glide: flight-path hold C_L = clamp(C_L* + 2.5(γ_eq − γ)), with C_L* = √(C_D0/k) (capped at 0.9 C_Lmax).
- The simulation reports Mach = V/a and Re = ρ V c̄/μ (Sutherland viscosity).

**Sonde resolution.** Δz = w_sink Δt_s, with w_sink = V/(L/D) and V = √(2W/(ρ S C_L)).

**Hybrid stage.**
- Energy left = E_usable − P_avionics (t_ascent + t_glide).
- P = W V/((L/D) η) + P_avionics, t = E_left/P, range = V t.

**Checks.**

| ID | Rule | Severity |
|---|---|---|
| SD-ASC-001 | Burst below release | error |
| SD-ASC-002 | Burst − release < 2 km | warning |
| SD-ASC-003 | Launch ascent rate outside 3–8 m/s | warning |
| SD-GL-001 | M_max > 0.6 | warning |
| SD-GL-002 | Re < 60 000 after the pull-out | warning |
| SD-GL-003 | No recovery to a steady glide | error |
| SD-PW-001 | Battery exhausted before the powered stage | error |

**Wind-aware ascent.**
- Optional: the SondeHub instance of the Tawhiri predictor (NOAA GFS winds), standard profile, with burst_altitude = release altitude. The descent stage is ignored.
- The ascent track is exported as KML.
- Online only, for non-commercial use.

**Verification.** `tests/engineering/sounding.test.mjs` checks:
- the lift budget, launch volume and ascent rate by hand;
- the burst volume identity;
- that more free lift rises faster but bursts lower, and that hydrogen needs less gas;
- burst-before-release handling;
- glide-polar formulas;
- that the pull-out respects n_max;
- that glide distance ≈ (L/D) × height lost, to within 10 %;
- the hybrid energy bookkeeping;
- the Tawhiri query, parsing and KML.

**Limitations.**
- No wind in the glide.
- No gas temperature lag or superpressure.
- Constant C_D0 and C_Lmax: low-Re data must be supplied by the user.
- No thermal model of the battery: the cold-soak note only.
- Simulation for planning; airspace approval is the operator's responsibility.

## 9. Planned models (not implemented)

CG and inertia (Build 5), propeller performance at forward speed (Build 5), aerofoil and lift/drag estimates (Build 5), beam bending/torsion and vibration (Build 5), rigid-body dynamics and control (Build 6), camera geometry and GSD (Build 7), mission energy (Build 7). Each will be added to this document, with tests, before it is used.
