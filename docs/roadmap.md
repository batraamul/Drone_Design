# Roadmap

Fifteen controlled builds: the twelve of the master prompt (§26) plus three extension builds agreed on 2026-11-22. Each build must leave the application runnable and pass its acceptance criteria before the next is treated as complete. Civilian and non-weapon defence applications are supported (logistics, surveillance, meteorological support, high-altitude operations). In every build: no weapon, targeting, weapon-release or harmful-payload functions, and no connection of AI or autonomy to physical flight controls.

| Build | Name | Scope | Acceptance criteria | Status |
|---|---|---|---|---|
| 1 | Foundation | Repository inspection; application shell; navigation; dashboard; theme; project manager; IndexedDB; autosave; documentation | App launches, navigation works, projects create/save/reload, no critical console errors, tests pass | **Complete — deployed (v0.1.0–0.2.2)** |
| 2 | Configuration and 3D design | Aircraft categories, configuration wizard, geometry parameters, initial 2D/3D conceptual models | Configurations persist and visualisations respond to parameter changes | **Complete — v0.3.0** (micro-lab models stay in Build 6) |
| 3 | Avionics and electronics | Component catalogue, interfaces, block diagrams, power draw and compatibility checks | Components can be added, connected, saved and checked | **Complete — v0.4.0** (link budget and SDR in Build 7) |
| 4 | Propulsion and energy | Motor/propeller/battery models, mass and power budgets, endurance estimates | Equations tested and dependent project values update | **Complete — v0.5.0** (prop at forward speed with Build 5) |
| 5 | Aerodynamics and structures | Wing geometry, aerodynamic estimates, CG and preliminary structural models | Plots update, units are correct and model limitations are documented | **Complete — v0.6.0** (CG from component placement, forward-speed propeller, OpenVSP bridge move to Build 6) |
| 6 | Flight dynamics | Attitude/trajectory simulation, wind disturbance, response plots, deterministic scenarios | Reproducible simulation and visible response to parameter changes | Next |
| 7 | Mission and payload | Civilian payloads, camera calculations, waypoints, profiles, weather inputs, mission feasibility | Payload mass/power affects aircraft budget and mission estimates | Planned |
| 8 | AI perception and health | Computer-vision demonstration, sensor-fusion comparisons, predictive maintenance, anomaly detection | ≥ 1 vision model or documented inference demo, two fusion approaches, a reproducible maintenance/anomaly example | Planned |
| 9 | AI autonomy and edge computing | Benign path-planning comparisons, RL exercise, model benchmarking, edge deployment estimates | Two path planners, one safe RL exercise, transparent edge benchmark methodology | Planned |
| 10 | Integrated digital twin | Geometry, dynamics, virtual sensors, camera stream, energy, simulation and AI outputs connected | Simulated aircraft state and AI results synchronised and saved | Planned |
| 11 | Engineering intelligence and reports | Compatibility engine, warnings, sensitivity analysis, design comparison, FMEA, exportable reports | Warnings explainable; reports include assumptions and versioning | Planned |
| 12 | Release | Regression, performance, storage, UI, accessibility, browser and deployment testing; documentation; release | Clean deployment, stable application, verified update flow, documented limitations | Planned |
| 13 | Stratospheric sounding | Balloon ascent and burst model; release-to-glide transition; glide-back recovery simulation (low Reynolds number); radiosonde sensor models with error and lag; WMO-style profile export | Ascent rate and burst altitude agree with published balloon data within a stated tolerance; simulated profiles export and re-import; all simulated data labelled | **Started early in v0.5.0** (ascent, release, pull-out, glide, hybrid stage, wind-aware ascent) |
| 14 | Defence applications and assurance | Environmental and EMC qualification test planning (MIL-STD-810H, MIL-STD-461G, RTCA DO-160G-style matrices); reliability prediction and FMECA; requirements traceability and configuration management; link-security and GNSS-denied navigation research checklists | Every requirement traces to design data and a verification method; FMECA and reliability results reproducible; every checklist cites its source standard and revision | Planned |
| 15 | Open publication | Validation benchmark suite against published data; usability-study kit; reproducible results package; Apache-2.0 release with CITATION.cff and archived DOI (Zenodo); manuscript for an IEEE Transactions venue | Benchmarks reproduce from a clean clone with one command; archived release with DOI; manuscript figures generated from the released code | Planned |

## Build 2 (complete, v0.3.0)

What was delivered, against the plan:
1. Configuration schema and project schema v2, with the 1→2 migration and tests. Done.
2. Configuration wizard in Drone Architecture (category → layout → parameters) with validation and provenance. Done.
3. Geometry parameters and derived geometry, documented in `docs/engineering-models.md` §5 and tested. Done.
4. Top, front and side SVG views redrawn on every change. Done.
5. 3D conceptual model with vendored three.js 0.170.0, orbit, pan, zoom, standard views and a 2D fallback. Done.
6. Browser tests for persistence and for views responding to changes. Done (`tests/e2e/build2.spec.mjs`).

Two lessons were added: rotor layout and hover, and wing planform and tail volume, each with a calculator.

## Build 3 (complete, v0.4.0)

1. Component data model, provenance per component, and project schema v3 with the 2→3 migration. Done.
2. Illustrative catalogue of 20 parts (all named "Example …") and custom components with a datasheet source. Done.
3. Power and data connections, and an auto-laid-out block diagram. Done.
4. Worst-case power budget per rail and compatibility checks (voltage, current, derating, ports, logic levels, provenance). Done.
5. Browser tests: add, connect, save and check. Done (`tests/e2e/build3.spec.mjs`).

A lesson on power budgets, regulators and logic levels was added, with a calculator.

## Build 4 (complete, v0.5.0)

1. Motor and propeller data model with provenance; project schema v4 with migration. Done.
2. Propulsion model: hover operating point, thrust versus throttle, full-throttle T/W, hot-and-high (ISA + ΔT). Done.
3. Battery model: OCV curve, internal resistance, sag, current for a power, time-stepped endurance. Done.
4. Mass budget from components, motors, propellers, structure and payload, against the MTOW target. Done.
5. Hover and cruise endurance and range. Done; the charts use the built-in SVG plots, so Chart.js was not needed.
6. Tests: hand-checked equations; browser tests showing dependent values update. Done.

Also in v0.5.0:
- the **design flow**: seven steps, a step bar on every design page, and a dashboard card;
- the **Design Summary** and build sheet, with a parts-list CSV, key results with provenance, and paper and patent guidance;
- **Courses, books & tools** in the Learning Centre;
- **STL/glTF export** of the 3D model;
- the early **Stratospheric Sounding Lab**: balloon to 33 km, release, stall and pull-out, glide, hybrid powered stage, and SondeHub/Tawhiri wind-aware ascent with KML export.

## Build 5 (complete, v0.6.0)

1. **Aerodynamics:** lifting-line (Glauert) wing model with DATCOM sweep correction; aerofoil presets with Reynolds-corrected c_l,max; component drag build-up; drag polar, L/D, stall, best-glide and best-endurance speeds, power-required curve. Done. It now replaces the L/D estimate in Propulsion & Energy and the glide-sonde C_D0/C_Lmax/e inputs, with C_D0 recomputed at the local Reynolds number.
2. **Stability:** neutral point (wing, tail, fuselage), static margin, suggested CG. Done.
3. **Structures:** spar root bending, deflection, auto-sized tubes; arm/boom stress, deflection, first natural frequency against 1P/2P; balloon pull-out load. Done.
4. **Formula Library:** built-in registry with calculators and code/test/doc links; user formulas with unit checking, limits, add/change/delete; documented procedure (`docs/formulas.md`). Done.
5. **Ease of use:** six ready-made example designs, layout-matched example parts, balloon suggestion, dashboard welcome and design-health card, nine-step flow. Done.

## Build 6 plan (next)

1. **CG and inertia** from component placement in the 3D studio (mass properties feed the static margin). ← *next exact task*
2. **Propeller at forward speed:** C_T(J), C_P(J) from UIUC-style tables; the cruise operating point.
3. **Flight dynamics:** 6-DoF rigid-body model, linearised modes (short period, phugoid, Dutch roll), wind and gust disturbance, deterministic scenarios.
4. **Micro Drone Laboratory** models.
5. **OpenVSP bridge:** export a VSP script or parameter set for higher-fidelity geometry and aerodynamics.

## Extension builds 13–15 (detail)

### Build 13 — Stratospheric Sounding Laboratory
1. **Balloon ascent:** lift gas (He/H₂), free lift, ascent rate from a drag balance with Reynolds-dependent drag coefficient, envelope growth with altitude, and burst at the rated diameter. Inputs are ISA or a user-supplied sounding.
2. **Release and glide-back:** release at a set altitude or pressure, release-to-glide transition dynamics, and low-Re glide polar (uses the Build 5 aerodynamics). Recovery-point prediction under the wind profile. Simulation only, never connected to hardware.
3. **Sonde sensor models:** temperature (time constant and solar radiation error), humidity (time lag, low-temperature dry bias), pressure or GNSS-derived height, and GNSS wind. Each has its source and stated uncertainty.
4. **Data products:** simulated profiles exported as CSV/JSON, a TEMP-like text listing of standard and significant levels, and a BUFR template description. Everything is labelled as simulated.
5. **Validation:** ascent rate and burst height compared with published balloon-manufacturer charts and archived soundings.

### Build 14 — Defence applications and assurance (non-weapon)
1. **Requirements traceability matrix:** requirement → design data → verification method (analysis, inspection, demonstration, test) → evidence and status.
2. **Environmental and EMC qualification planning:** test matrices modelled on MIL-STD-810H (temperature, altitude, humidity, vibration, shock, rain, dust), MIL-STD-461G (CE/CS/RE/RS) and RTCA DO-160G. They are planning aids that cite the standard and revision; they are not compliance claims.
3. **Reliability:** parts-count and stress prediction with documented failure-rate sources, FMECA with criticality, and fault-tree export.
4. **Configuration management:** baselines, change requests and design-version diffing (uses the existing version system).
5. **Research checklists:** link security (encryption, authentication, failsafe behaviour) and GNSS-denied navigation (sensor-fusion options evaluated in simulation).
6. **Defence application profiles (non-weapon):**
   - high-altitude and cold operations (Ladakh and Siachen-class density altitudes, −30 °C batteries);
   - logistics resupply to forward posts;
   - surveillance-endurance missions;
   - disaster relief with the armed forces;
   - meteorological support with balloon glide-sondes.

   Each is sized with the existing models, with MIL-STD-style environmental cases.
7. **Publication and IP support:** Defence Science Journal manuscript template from the Design Summary results; patent-disclosure draft (problem, prior-art table from InPASS / Google Patents searches, claims outline).
6. **Out of scope by design:** weapons, targeting, weapon release, delivery of harmful payloads, electronic attack, and any autonomy connected to real flight controls.

### Build 15 — Open publication (IEEE Transactions, open source and free)
1. **Validation benchmark suite:** each model compared with published data (ISA tables, momentum-theory and propeller test data, wing-geometry textbook cases, battery discharge data), with tolerances. It runs with `npm run benchmark`.
2. **Reproducible results package:** pinned dependencies, deterministic seeds, and a script that regenerates every manuscript figure and table.
3. **Usability and educational-value study kit:** tasks, questionnaires (SUS), consent template and anonymised data schema.
4. **Release:** Apache-2.0 (in place since v0.4.0), CITATION.cff, a tagged GitHub release archived on Zenodo for a DOI, and a software-paper checklist.
5. **Manuscript:** target IEEE Transactions on Education, IEEE Transactions on Aerospace and Electronic Systems, or IEEE Transactions on Geoscience and Remote Sensing (sounding results). Open-access options: IEEE Access, or a software paper in SoftwareX or JOSS.

## Cross-cutting work carried through all builds

- Learning Centre lessons for every new model (beginner explanation, theory, equations, variables, worked example, calculator, practical notes, common mistakes, knowledge check).
- Glossary growth; data-provenance labels on every new value.
- Structural checks, unit/integration and browser tests extended with each module.
