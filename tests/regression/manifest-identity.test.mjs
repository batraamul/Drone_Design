/**
 * Regression: AEROLAB X must never share its web-app identity with E-Diary, which
 * lives on the same host (batraamul.github.io/e-diary/, manifest id "./").
 * Chrome resolves a relative manifest id against the ORIGIN, so "./" or "/" made
 * AEROLAB X look like a new version of E-Diary ("Review logo and name updates").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));
const origin = 'https://batraamul.github.io';

test('manifest id is unique to AEROLAB X under every resolution rule', () => {
  const id = manifest.id;
  assert.ok(id, 'manifest must declare an id');
  const againstOrigin = new URL(id, origin + '/').href;
  const againstStart = new URL(id, new URL(manifest.start_url, origin + '/Drone_Design/manifest.json')).href;
  const ediary = [origin + '/', origin + '/e-diary/', origin + '/e-diary/index.html'];
  for (const resolved of [againstOrigin, againstStart]) {
    assert.ok(resolved.startsWith(origin + '/Drone_Design/'), `id resolves outside /Drone_Design/: ${resolved}`);
    assert.ok(!ediary.includes(resolved), `id collides with E-Diary: ${resolved}`);
  }
});

test('manifest names and scope are AEROLAB X only', () => {
  assert.match(manifest.name, /^AEROLAB X/);
  assert.equal(manifest.scope, './');
});
