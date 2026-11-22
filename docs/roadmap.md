# Roadmap

Twelve controlled builds (master prompt §26). Each build must leave the application runnable and pass its acceptance criteria before the next is treated as complete.

| Build | Name | Scope | Acceptance criteria | Status |
|---|---|---|---|---|
| 1 | Foundation | Repository inspection; application shell; navigation; dashboard; theme; project manager; IndexedDB; autosave; documentation | App launches, navigation works, projects create/save/reload, no critical console errors, tests pass | **Complete — deployed (v0.1.0–0.2.2)** |
| 2 | Configuration and 3D design | Aircraft categories, configuration wizard, geometry parameters, initial 2D/3D conceptual models | Configurations persist and visualisations respond to parameter changes | **Complete — v0.3.0** (micro-lab models stay in Build 6) |
| 3 | Avionics and electronics | Component catalogue, interfaces, block diagrams, power draw and compatibility checks | Components can be added, connected, saved and checked | Next |
| 4 | Propulsion and energy | Motor/propeller/battery models, mass and power budgets, endurance estimates | Equations tested and dependent project values update | Planned |
| 5 | Aerodynamics and structures | Wing geometry, aerodynamic estimates, CG and preliminary structural models | Plots update, units are correct and model limitations are documented | Planned |
| 6 | Flight dynamics | Attitude/trajectory simulation, wind disturbance, response plots, deterministic scenarios | Reproducible simulation and visible response to parameter changes | Planned |
| 7 | Mission and payload | Civilian payloads, camera calculations, waypoints, profiles, weather inputs, mission feasibility | Payload mass/power affects aircraft budget and mission estimates | Planned |
| 8 | AI perception and health | Computer-vision demonstration, sensor-fusion comparisons, predictive maintenance, anomaly detection | ≥ 1 vision model or documented inference demo, two fusion approaches, a reproducible maintenance/anomaly example | Planned |
| 9 | AI autonomy and edge computing | Benign path-planning comparisons, RL exercise, model benchmarking, edge deployment estimates | Two path planners, one safe RL exercise, transparent edge benchmark methodology | Planned |
| 10 | Integrated digital twin | Geometry, dynamics, virtual sensors, camera stream, energy, simulation and AI outputs connected | Simulated aircraft state and AI results synchronised and saved | Planned |
| 11 | Engineering intelligence and reports | Compatibility engine, warnings, sensitivity analysis, design comparison, FMEA, exportable reports | Warnings explainable; reports include assumptions and versioning | Planned |
| 12 | Release | Regression, performance, storage, UI, accessibility, browser and deployment testing; documentation; release | Clean deployment, stable application, verified update flow, documented limitations | Planned |

## Build 2 (complete, v0.3.0)

What was delivered, against the plan:
1. Configuration schema and project schema v2, with the 1→2 migration and tests. Done.
2. Configuration wizard in Drone Architecture (category → layout → parameters) with validation and provenance. Done.
3. Geometry parameters and derived geometry, documented in `docs/engineering-models.md` §5 and tested. Done.
4. Top, front and side SVG views redrawn on every change. Done.
5. 3D conceptual model with vendored three.js 0.170.0, orbit, pan, zoom, standard views and a 2D fallback. Done.
6. Browser tests for persistence and for views responding to changes. Done (`tests/e2e/build2.spec.mjs`).

Two lessons were added: rotor layout and hover, and wing planform and tail volume, each with a calculator.

## Build 3 plan (next)

1. **Component data model**: catalogue schema (flight controller, ESC, motor, receiver, telemetry radio, GNSS, companion computer, sensors, payload interface) with provenance per value (datasheet with a source reference, or illustrative). Project schema v3 adds `modules.components`, with a migration. ← *next exact task*
2. A small **illustrative catalogue**, clearly labelled as not real products, plus "add your own component" with a datasheet reference.
3. **Interfaces and connections** (power, PWM/DShot, UART, I²C, SPI, CAN, Ethernet, USB) and a block-diagram editor.
4. **Power-draw budget** per voltage rail, and **compatibility checks** (voltage, current, logic level, connector, port count), each explainable.
5. Browser tests: add, connect, save and check components.

## Cross-cutting work carried through all builds

- Learning Centre lessons for every new model (beginner explanation, theory, equations, variables, worked example, calculator, practical notes, common mistakes, knowledge check).
- Glossary growth; data-provenance labels on every new value.
- Structural checks, unit/integration and browser tests extended with each module.
