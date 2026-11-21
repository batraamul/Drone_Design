# Roadmap

Twelve controlled builds (master prompt §26). Each build must leave the application runnable and pass its acceptance criteria before the next is treated as complete.

| Build | Name | Scope | Acceptance criteria | Status |
|---|---|---|---|---|
| 1 | Foundation | Repository inspection; application shell; navigation; dashboard; theme; project manager; IndexedDB; autosave; documentation | App launches, navigation works, projects create/save/reload, no critical console errors, tests pass | **Complete locally — awaiting first push and deployment** |
| 2 | Configuration and 3D design | Aircraft categories, configuration wizard, geometry parameters, initial 2D/3D conceptual models | Configurations persist and visualisations respond to parameter changes | Next |
| 3 | Avionics and electronics | Component catalogue, interfaces, block diagrams, power draw and compatibility checks | Components can be added, connected, saved and checked | Planned |
| 4 | Propulsion and energy | Motor/propeller/battery models, mass and power budgets, endurance estimates | Equations tested and dependent project values update | Planned |
| 5 | Aerodynamics and structures | Wing geometry, aerodynamic estimates, CG and preliminary structural models | Plots update, units are correct and model limitations are documented | Planned |
| 6 | Flight dynamics | Attitude/trajectory simulation, wind disturbance, response plots, deterministic scenarios | Reproducible simulation and visible response to parameter changes | Planned |
| 7 | Mission and payload | Civilian payloads, camera calculations, waypoints, profiles, weather inputs, mission feasibility | Payload mass/power affects aircraft budget and mission estimates | Planned |
| 8 | AI perception and health | Computer-vision demonstration, sensor-fusion comparisons, predictive maintenance, anomaly detection | ≥ 1 vision model or documented inference demo, two fusion approaches, a reproducible maintenance/anomaly example | Planned |
| 9 | AI autonomy and edge computing | Benign path-planning comparisons, RL exercise, model benchmarking, edge deployment estimates | Two path planners, one safe RL exercise, transparent edge benchmark methodology | Planned |
| 10 | Integrated digital twin | Geometry, dynamics, virtual sensors, camera stream, energy, simulation and AI outputs connected | Simulated aircraft state and AI results synchronised and saved | Planned |
| 11 | Engineering intelligence and reports | Compatibility engine, warnings, sensitivity analysis, design comparison, FMEA, exportable reports | Warnings explainable; reports include assumptions and versioning | Planned |
| 12 | Release | Regression, performance, storage, UI, accessibility, browser and deployment testing; documentation; release | Clean deployment, stable application, verified update flow, documented limitations | Planned |

## Build 2 plan (next)

Smallest deliverable first:

1. **Configuration schema** — typed `modules.configuration` (category-specific layout: rotor count and arrangement X/+/H/coaxial; fixed-wing planform and tail; VTOL type), project schema v2 with a v1→v2 document migration and tests. ← *next exact task*
2. **Configuration wizard** in Drone Architecture: category → layout → key parameters, with validation and provenance.
3. **Geometry parameters** and derived geometry (arm length and rotor spacing, disc area and disc loading inputs; span, area, aspect ratio, taper, sweep), each documented in `docs/engineering-models.md` with tests.
4. **2D views** (top/front/side SVG) that redraw on every parameter change.
5. **3D conceptual model** with vendored Three.js (pinned, licence included), orbit/pan/zoom and standard views; 2D fallback when WebGL is unavailable.
6. Browser tests proving persistence and that the views respond to parameter changes.

## Cross-cutting work carried through all builds

- Learning Centre lessons for every new model (beginner explanation, theory, equations, variables, worked example, calculator, practical notes, common mistakes, knowledge check).
- Glossary growth; data-provenance labels on every new value.
- Structural checks, unit/integration and browser tests extended with each module.
