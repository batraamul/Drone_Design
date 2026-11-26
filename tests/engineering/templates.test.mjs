/**
 * Example designs ("Start from an example"): every template builds a valid project whose
 * models raise no errors, and the balloon suggestion keeps a burst margin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN_TEMPLATES, templateProject, suggestBalloon } from '../../js/engineering/templates.js';
import { createProject, validateProject } from '../../js/project-schema.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { analyseElectrical } from '../../js/engineering/electrical.js';
import { analysePropulsion } from '../../js/engineering/propulsion.js';
import { aerodynamicModel, analyseAerodynamics } from '../../js/engineering/aerodynamics.js';
import { analyseStructures } from '../../js/engineering/structures.js';
import { analyseSounding, defaultSounding } from '../../js/engineering/sounding.js';
import { soundingInputs } from '../../js/modules/sounding.js';

for (const t of DESIGN_TEMPLATES) {
  test(`example design "${t.name}" is valid and has no errors`, () => {
    const init = templateProject(t.id);
    const doc = createProject(init);
    doc.modules = { ...doc.modules, ...init.modules };
    assert.deepEqual(validateProject(doc), []);
    assert.equal(doc.category, t.category);
    const req = doc.requirements;
    const geo = computeGeometry(doc.modules.configuration, req);
    const el = analyseElectrical(doc.modules.components);
    const aero = aerodynamicModel({ aerodynamics: doc.modules.aerodynamics, configuration: doc.modules.configuration, geometry: geo, requirements: req });
    const pr = analysePropulsion({ propulsion: doc.modules.propulsion, geometry: geo, requirements: req, components: doc.modules.components, electrical: el, aero });
    const ae = aero ? analyseAerodynamics({ model: aero, mass: pr.mass.total, requirements: req }) : null;
    const sd = doc.modules.sounding.enabled ? analyseSounding(soundingInputs(doc.modules.sounding, pr, geo, aero)) : null;
    const st = analyseStructures({ structures: doc.modules.structures, geometry: geo, configuration: doc.modules.configuration, propulsion: pr, aerodynamics: ae, soundingLoadFactor: sd?.glide?.stats?.maxN });
    const errors = [...geo.checks, ...el.checks, ...pr.checks, ...(ae?.checks ?? []), ...st.checks, ...(sd?.checks ?? [])].filter((c) => c.severity === 'error');
    assert.deepEqual(errors.map((c) => c.id), []);
    assert.ok(pr.endurance?.time > 0);
    assert.ok(pr.mass.total <= req.maxTakeoffMass.value, 'mass within the target');
    if (t.sounding) assert.ok(sd.glide, 'glide simulated');
  });
}

test('balloon suggestion: smallest balloon with ≥ 3 km burst margin, null when impossible', () => {
  const p = defaultSounding().params;
  const pick = suggestBalloon(p, 1.0);
  assert.ok(pick);
  assert.ok(pick.ascent.burstAltitude - pick.ascent.releaseAltitudeAMSL >= 3000);
  assert.equal(suggestBalloon({ ...p, releaseAltitude: 44000 }, 20), null);
});
