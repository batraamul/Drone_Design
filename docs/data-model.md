# Data model

All engineering quantities are stored in **SI units**. Every document carries a schema version so it can be migrated forward.

## 1. Project document (schema version 1)

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Document schema version (currently 1) |
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
| `modules` | object | Reserved for module data added by later builds (configuration, geometry, components, …) |
| `createdAt`, `updatedAt` | ISO 8601 | Timestamps |
| `deletedAt` | ISO 8601 or null | Set when the project is in the Trash |
| `appVersion` | string | Application version that last wrote the document |

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
