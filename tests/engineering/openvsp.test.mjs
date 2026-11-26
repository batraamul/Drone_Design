/**
 * OpenVSP bridge (Build 6): the script declares one geometry per part with the right
 * dimensions and the AEROLAB X → OpenVSP axis flip.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vspScript } from '../../js/engineering/openvsp.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { defaultConfiguration } from '../../js/engineering/configuration.js';

const geoms = (text, type) => (text.match(new RegExp(`AddGeom\\( "${type}"`, 'g')) ?? []).length;
const value = (text, id, parm) => Number(new RegExp(`SetParmVal\\( ${id}, "${parm}", "[^"]+", ([-\\d.e]+) \\)`).exec(text)?.[1]);

test('quadplane script: wing, tail, fuselage, booms and five rotors', () => {
  const geo = computeGeometry(defaultConfiguration('quadplane'), {});
  const t = vspScript(geo, { name: 'Test <script>' });
  assert.equal(geoms(t, 'WING'), 3);
  assert.equal(geoms(t, 'PROP'), 5);
  assert.equal(geoms(t, 'POD'), 1 + geo.booms.length);
  assert.equal(value(t, 'wing', 'Span'), geo.wing.span / 2);
  assert.equal(value(t, 'wing', 'Root_Chord'), geo.wing.rootChord);
  assert.ok(Math.abs(value(t, 'wing', 'X_Rel_Location') + geo.wing.xRootLE) < 1e-6, 'X flipped (aft positive)');
  assert.match(t, /void main\(\)/);
  assert.doesNotMatch(t, /<script>/);
  const opens = (t.match(/\{/g) ?? []).length;
  assert.equal(opens, (t.match(/\}/g) ?? []).length);
});

test('multirotor script: body and rotor discs only', () => {
  const t = vspScript(computeGeometry(defaultConfiguration('hexa-x'), {}));
  assert.equal(geoms(t, 'WING'), 0);
  assert.equal(geoms(t, 'PROP'), 6);
  assert.equal(geoms(t, 'POD'), 1);
  assert.equal(vspScript(null), null);
});
