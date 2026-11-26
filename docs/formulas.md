# Formulas: how to add, change or delete them

AEROLAB X has two kinds of formulas.

| | Your formulas | Built-in formulas |
|---|---|---|
| Where | Saved in the project (`modules.formulas`) | In the code (`js/engineering/*.js`) |
| Who changes them | Anyone, in the app | A developer, by a code change |
| Checked by | The unit checker, live, in the editor | Unit tests (`npm test`) |
| Appear in | Design review, Summary | Every page that uses the model |

The Formula Library page (`#/formulas`) lists both. Each built-in entry shows the equation, its variables and units, a calculator, and links to the code, its test, its documentation section and its reference.

---

## A. Your formulas (no code)

Use these for anything the built-in models do not compute: a rule of thumb from your organisation, a coefficient from a paper, a requirement check.

### Add

1. Open a project, then **Formula Library → Your formulas → Add a formula**.
2. **Name** — what it is, e.g. *Wing loading at MTOW*.
3. **Symbol** — a variable name (letters, digits, `_`; must start with a letter or `_`), e.g. `WS`. Other formulas can use it.
4. **Expression** — click variables in the list on the right to insert them. Syntax:
   - `+ − * / ^` and brackets; `^` is a power and binds right-to-left (`2^3^2 = 2^9`).
   - Functions: `sqrt abs exp ln log10 sin cos tan asin acos atan atan2 min max`. Angles are in radians.
   - Constants: `pi`, `g0` (9.80665 m/s²).
   - A plain number has no unit. Give a number a unit with brackets: `1.225[kg/m³]`, `9.81[m/s²]`, `10[m/s]`.
5. **Result unit** — the SI unit of the answer. The preview shows the value now and stops you if the units do not match (it also suggests the unit that would fit).
6. Optional **limit** — *must be ≤* or *must be ≥* a number, shown as a warning, error or note in the design review when broken.
7. **Description and reference** — say where the formula comes from.

### Variables you can use

| Group | Examples | Units |
|---|---|---|
| Mission targets | `maxTakeoffMass`, `payloadMass`, `endurance`, `range`, `cruiseSpeed`, `operatingAltitude`, `maxWindSpeed` | SI (kg, s, m, m/s) |
| Layout parameters | `span`, `rootChord`, `armLength`, `propDiameter`, `tailArm` … (whatever the current layout has) | SI |
| Design results | every numeric result in the review, by its id with `-` written as `_`: `geo_fw_area`, `pr_mass`, `pr_endurance`, `ae_cd0`, `ae_vs`, `st_spar_stress` … | the result's SI unit |
| Your formulas | by their symbol | their result unit |

Values are always SI (metres, kilograms, seconds, newtons, watts, pascals), whatever display units you chose elsewhere.

### Change

**Formula Library → Your formulas → Change** on its row. The same editor opens with the current values. Formulas that use it update immediately.

### Delete

**Delete** on its row. If other formulas use its symbol, the dialog lists them; they show an error until you change them. **Ctrl+Z** (or the Undo button) restores a deleted or changed formula.

### Where the results go

- The **design review** (inspector panel) lists each result as `cf-<symbol>` and each broken limit as `CF-<symbol>`.
- The **Summary** page has a *Your formulas* table, printed with the build sheet.
- Formulas travel with the project: export/import and Google Drive sync include them.

### Examples

| Name | Symbol | Expression | Unit |
|---|---|---|---|
| Wing loading | `WS` | `maxTakeoffMass * g0 / geo_fw_area` | `Pa` |
| Dynamic pressure at cruise | `q` | `0.5 * 1.225[kg/m³] * cruiseSpeed^2` | `Pa` |
| Cruise lift coefficient | `CLc` | `WS / q` | `1` |
| Hover power per kilogram | `PW` | `geo_mr_pideal / maxTakeoffMass` | `W/kg` |
| Glide ratio needed for 100 km from 30 km | `LDreq` | `100000[m] / 30000[m]` | `1` |

---

## B. Built-in formulas (code change)

A built-in formula lives in three places that must stay in step: **the model code**, **its registry entry**, and **its tests and documentation**. The test `tests/engineering/formulas.test.mjs` checks the registry against the code and docs automatically.

### Add a built-in formula

1. **Model code.** Implement it in the right model file (`js/engineering/<area>.js`) as an exported function. Inputs and outputs in SI units. If the result is shown to users, push a *derived* record with `id`, `label`, `symbol`, `value`, `unit` (SI), `equation`, `inputs`, `provenance` (`analytical` for exact physics, `conceptual-estimate` for empirical or simplified models) and `assumptions`.
2. **Checks.** If it can flag a problem, push a *check* with a stable id (`XX-AREA-NNN`), `severity`, a plain-language `message` that says how to fix it, the `equation` and its `inputs`.
3. **Registry.** Add an entry to `BUILTIN_FORMULAS` in `js/engineering/formulas.js`:
   ```js
   { id: 'my-formula', area: 'aerodynamics', title: 'What it computes',
     equation: 'X = a b / c',              // as shown to users
     calc: 'a*b/c',                         // the same, in expression syntax
     result: { symbol: 'X', unit: 'N' },    // SI unit of the result
     inputs: [v('a', 'Label', 'Pa', 100), v('b', 'Label', 'm²', 0.5), v('c', 'Label', '1', 2)],
     model: 'js/engineering/aerodynamics.js', fn: 'myFunction',
     test: 'tests/engineering/aerodynamics.test.mjs', doc: 'engineering-models.md §9',
     reference: 'Author, Title, equation number' }
   ```
   Units must be keys of `UNIT_DIMENSIONS` in `js/engineering/expression.js` (add a unit there with its dimension vector [m, kg, s, A, K] if needed).
4. **Tests.** Add a unit test that checks the function against a hand calculation or a published value (`tests/engineering/<area>.test.mjs`).
5. **Docs.** Describe the equation, its assumptions and its validity limits in `docs/engineering-models.md` in the section named in the registry entry.
6. **Changelog.** Add a line to `CHANGELOG.md`.
7. Run `npm test`. All checks must pass before committing.

### Change a built-in formula

1. Change the function in the model file.
2. Update its registry entry (`equation`, `calc`, `inputs`, `result.unit`, `reference`) so the calculator matches the code.
3. Update the tests: change expected values only with a hand calculation or reference that justifies the new value, and say so in the test.
4. Update the documentation section and the lesson (`js/modules/learning/lessons.js`) if it explains the formula. Lesson worked examples call the model code, so they update by themselves.
5. If the change alters what is **saved in a project** (new or renamed fields), bump `PROJECT_SCHEMA_VERSION` in `js/project-schema.js` and add a migration `MIGRATIONS[n]` with a test in `tests/unit/project-schema.test.mjs`; record it in `docs/data-model.md`.
6. Changelog entry, then `npm test`.

### Delete a built-in formula

1. Search for every use: `grep -rn "functionName\|derived-id\|CHECK-ID" js tests docs`.
2. Remove or replace the uses in the models and pages. If users' own formulas might reference its derived id (`area_name`), say so in the changelog: those formulas will show *Unknown variable* until edited.
3. Remove the registry entry, its tests and its documentation, and any lesson text that relies on it.
4. If saved project data changes, add a schema migration (step 5 above).
5. Changelog entry, then `npm test`.

### Rules that always apply

- SI inside the code; convert only for display.
- Never present an estimate as validated data: use the provenance labels.
- A formula without a test and a reference is not finished.
