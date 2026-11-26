# Data model

All engineering quantities are stored in **SI units**. Every document carries a schema version so it can be migrated forward.

## 1. Project document (schema version 7)

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Document schema version (currently 7; 1 = Build 1, 2 = Build 2, 3 = Build 3, 4 = Build 4, 5 = balloon mission, 6 = Build 5, 7 = Build 6) |
| `id` | string `prj_…` | Stable project identifier |
| `revision` | integer | Persistence revision; increments on every save; used for conflict detection |
| `name` | string ≤ 120 | Project name |
| `description` | string ≤ 5000 | Purpose, environment, constraints |
| `category` | enum | `multirotor`, `fixed-wing`, `vtol`, `special`, `micro` |
| `application` | enum | Civilian application: `aerial-mapping`, `inspection`, `environmental`, `atmospheric`, `agriculture`, `search-rescue`, `communication-relay`, `scientific`, `education`, `other` |
| `stage` | enum | User-declared maturity: `concept`, `preliminary`, `detailed`, `prototype`, `testing` (deliberately no "flight-ready") |
| `tags` | string[] ≤ 20 | Free tags (each ≤ 40 characters) |
| `requirements` | object | Targets, see below |
| `notes` | Note[] ≤ 500 | Design log |
| `modules` | object | Module data: `configuration` (2), `components` (3), `propulsion` (4) and `sounding` (5), all required; see below. Unknown module keys are preserved |
| `createdAt`, `updatedAt` | ISO 8601 | Timestamps |
| `deletedAt` | ISO 8601 or null | Set when the project is in the Trash |
| `appVersion` | string | Application version that last wrote the document |

### Configuration (`modules.configuration`, schema 2)

`{ layout: string, options: { propulsion?: 'tractor' | 'pusher' }, params: { <key>: number (SI) } }`

- `layout` is one of the 24 ids in `LAYOUTS` (`js/engineering/configuration.js`); each belongs to a category.
- `params` holds exactly the parameters that `paramsFor(layout)` lists, each within its range: lengths in m, angles in rad, ratios dimensionless.
- Validation also requires the wing leading edge to lie within the fuselage length.
- A layout from another category is tolerated, for example after a Drive merge of a category change; the Architecture page then asks for a layout.
- Import and migration repair invalid values to the layout defaults, with warnings.

### Components (`modules.components`, schema 3)

`{ items: Component[] (≤ 200), connections: Connection[] (≤ 600) }`

| Component field | Type | Notes |
|---|---|---|
| `id` | `cmp_…` | Unique within the project |
| `type` | enum | `battery`, `regulator`, `flight-controller`, `companion`, `esc`, `receiver`, `telemetry`, `gnss`, `sensor`, `payload` |
| `name` | string ≤ 120 | |
| `catalogueId` | string or null | Library entry it came from |
| `quantity` | integer 1–64 | Only for ESC, GNSS, sensor and payload; 1 otherwise |
| `provenance` | enum | `illustrative`, `datasheet`, `user-input`, `measured` |
| `source` | string ≤ 500 | Datasheet or test reference; expected for datasheet and measured values |
| `specs` | object | The fields of its type, in SI units (V, A, C, kg, Hz, W) |
| `interfaces` | object | Port counts per interface kind allowed for its type |

A connection is `{ id: 'con_…', kind: 'power' | 'uart' | 'i2c' | 'spi' | 'can' | 'pwm' | 'usb' | 'ethernet', from, to }`, joining two different existing components.

Import and migration keep valid values, reset invalid ones to neutral defaults, and drop connections to missing components, with warnings.

### Propulsion (`modules.propulsion`, schema 4)

`{ motor: Part, propeller: Part, batteryId: cmp id | null, settings }`
- A Part is `{ name, catalogueId, provenance, source, specs }`.
- Motor specs: `kv` (rpm/V), `resistance` (Ω), `noLoadCurrent` (A), `maxCurrent` (A), `mass` (kg).
- Propeller specs: `diameter` of the data (m), `pitch` (m), `ct`, `cp`, `mass` (kg).
- Settings: `structureMass` (kg), `usableFraction`, `escEfficiency`, `isaDeltaT` (K), `cruiseLD`, `cruisePropEfficiency`, `cruiseMotorEfficiency`.

The 3→4 migration picks the illustrative propeller closest to the configured diameter and a matching motor.

### Balloon mission (`modules.sounding`, schema 5)

`{ enabled, gas: 'helium' | 'hydrogen', balloon: { name, catalogueId, provenance, source }, useDesignMass, useDesignWing, params, site: { latitude, longitude } }`

The params, all in SI, are:
- balloon and launch: `launchElevation`, `balloonMass`, `burstDiameter`, `balloonCd`, `freeLift` (kg), `trainMass`, `payloadMass`, `releaseAltitude` (AGL);
- aircraft: `wingArea`, `wingSpan`, `cd0`, `oswald`, `clMax`, `maxLoadFactor`;
- sonde and hybrid stage: `sampleInterval`, `hybridAltitude`, `poweredLD`, `poweredEfficiency`.

`enabled` is false by default; the 4→5 migration adds it disabled.

### Aerodynamics (`modules.aerodynamics`, schema 6)

`{ aerofoil: { name, catalogueId, provenance, source, specs }, settings }`

- Aerofoil specs (SI; angles in rad): `thickness`, `xMaxThickness`, `liftSlope` (per rad), `alphaZeroLift`, `clMax`, `reRef`, `cm0`.
- Settings: `cg` (m behind the nose, or `null` to show a suggested CG), `laminarFraction`, `miscDrag`, `extraDragArea` (m²), `boomDiameter` (m), `tailEfficiency`.

The 5→6 migration picks an aerofoil preset for the layout: MH 45 for flying wings and deltas, SD7037 for gliders, Clark Y otherwise.

### Structures (`modules.structures`, schema 6)

`{ material, armMaterial, settings: { loadFactor, safetyFactor, sparOuter, sparWall, armOuter, armWall } }`

- `material` and `armMaterial` are ids from `MATERIALS`.
- The four tube dimensions (m) are `null` when the tube is auto-sized.

### Mass & balance (`modules.massProperties`, schema 7)

`{ placements: { [componentId]: { x, y, z } }, payload: { x, y, z } | null }`

- Positions are in metres in the body frame: x forward, nose at 0 for fixed wings; z up.
- Parts without a placement use a default by type; on fixed wings an unplaced battery balances automatically.
- Placements of deleted components are dropped on import.

### Flight dynamics (`modules.dynamics`, schema 7)

`{ settings: { motorTimeConstant: s | null, attitudeBandwidth: rad/s | null, gustSpeed: m/s, elevatorStep: rad } }`

`null` means automatic (estimated from the propeller diameter, or a third of the motor bandwidth).

### Propulsion additions (schema 7)

- `propeller.table` (optional): `[{ J, ct, cp }]`, 3–60 rows with J increasing. This is measured forward-speed data.
- `cruise` (optional): `{ motor, propeller }` for VTOL layouts with separate cruise rotors. It has the same shape as the main motor and propeller, and may have its own `table`.
- The 6→7 migration adds a cruise set to existing quadplanes.

### Your formulas (`modules.formulas`, schema 6)

`{ items: [{ id: 'fml_…', name, symbol, expression, unit, description, check: null | { op: '<=' | '>=', limit, severity: 'warning' | 'error' | 'info' } }] }`

- At most 100 formulas.
- Symbols are unique identifiers and must not be a function or constant name.
- `unit` is a key of `UNIT_DIMENSIONS` in `js/engineering/expression.js`.
- On import, invalid entries are dropped with a warning.

### Requirement entry

Each key holds `{ value: number | null, unit: <SI unit>, provenance: 'requirement' }`.

| Key | SI unit | Validation |
|---|---|---|
| `maxTakeoffMass` | kg | > 0 |
| `payloadMass` | kg | ≥ 0 |
| `endurance` | s | > 0 |
| `range` | m | > 0 (total distance per sortie) |
| `cruiseSpeed` | m/s | > 0 (true airspeed) |
| `operatingAltitude` | m | −5000 … ≈86 000 (AMSL, ISA range) |
| `maxWindSpeed` | m/s | ≥ 0 |

### Note

`{ id: 'note_…', title: string ≤ 200, body: string ≤ 50 000 (plain text), createdAt, updatedAt }`

## 2. IndexedDB stores (database `aerolab-x`, version 1)

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `projects` | `id` | `updatedAt` | Current project documents (including Trash) |
| `versions` | `id` | `projectId` | Version snapshots: `{ id, projectId, number, label, note, reason, createdAt, appVersion, schemaVersion, revision, snapshot }` |
| `preferences` | `key` | — | `{ key, value, updatedAt }` — theme, layout, display units, autosave, last project, last backup |
| `meta` | `key` | — | Database metadata: `schemaVersion`, `migrations` log, `createdAt` |
| `learningProgress` | `id` (lesson id) | — | `{ id, attempts, lastScore, lastAttemptAt, completedAt }` |

Version `reason` values: `created`, `manual`, `pre-restore`, `pre-migration`, `import`, `duplicate`.

## 3. Exchange formats

### Project file (`*.aerolab.json`)

```json
{
  "format": "aerolab-x/project",
  "formatVersion": 1,
  "exportedAt": "2026-11-21T18:00:00.000Z",
  "appVersion": "0.1.0",
  "project": { "...": "project document" },
  "versions": [ { "...": "version records (optional)" } ]
}
```

A bare project document is also accepted on import. Imports never overwrite: if the ID already exists, the project is added as a copy with a new ID.

### Full backup (`aerolab-x-backup-*.json`)

`{ format: 'aerolab-x/backup', formatVersion: 1, exportedAt, appVersion, databaseVersion, projects[], versions[], preferences[], learning[] }`

Restoring a backup **merges**: missing projects are added, identical ones (same revision and timestamp) are skipped, differing ones are added as copies, and existing preferences are kept.

### Google Drive device copy (`AEROLAB X — <device>.json`)

Stored in the Drive folder *AEROLAB X sync* (Drive `appProperties`: `aerolab=folder` for the folder; `aerolab=device`, `dev=<device id>`, `name=<device name>` for each copy):

`{ app: 'AEROLAB X', kind: 'device-copy', format: 1, appVersion, device: { id, name }, savedAt, data: { projects[], versions[], learning[], gone: { projectId: deletedAt } } }`

Merging (`js/sync/merge.js`) is three-way against the copy merged from that device last time (`meta` store key `gd-base:<device>`): changed on one side → that side; changed on both → later `updatedAt`; deleted on one side and unchanged on the other → deleted; deleted versus edited → edit kept; notes merged by id; permanently deleted projects listed in `gone` never return. The per-device `revision` counter is not synced. Sync settings live in `localStorage` (`aerolab:gdrive`, `aerolab:device`); the Google access token only in `sessionStorage`.

## 4. Migration policy

- **Database:** numbered, additive migrations only (new stores and indexes). Never delete stores, indexes or records.
- **Documents:** `MIGRATIONS[n]` upgrades schema n → n + 1 on a deep copy and must preserve all user content. The original document is saved as a `pre-migration` version before the upgraded one replaces it.
- **Newer files:** documents or files written by a newer schema are refused with a clear "update the application" message, never partially read.
