import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../../scripts/check-structure.mjs';

test('repository passes every structural quality gate', async () => {
  const { errors, passed } = await runChecks();
  assert.deepEqual(errors, [], `Structural problems:\n${errors.join('\n')}`);
  assert.ok(passed.length >= 10);
});
