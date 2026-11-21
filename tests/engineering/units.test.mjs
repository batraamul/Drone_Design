import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, toSI, fromSI, dimensionOf, unitsFor, UnitError, DIMENSIONS } from '../../js/engineering/units.js';

const close = (actual, expected, rel = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= rel * Math.max(1, Math.abs(expected)), `${actual} ≉ ${expected}`);

test('exact definitions of common aviation units', () => {
  close(toSI(1, 'kn'), 1852 / 3600);
  close(toSI(1, 'ft'), 0.3048);
  close(toSI(1, 'lb'), 0.45359237);
  close(toSI(1, 'nmi'), 1852);
  close(toSI(1, 'km/h'), 1 / 3.6);
  close(toSI(1, 'kgf'), 9.80665);
});

test('energy and charge units used for batteries', () => {
  close(toSI(1, 'Wh'), 3600);
  close(convert(1, 'kWh', 'Wh'), 1000);
  close(toSI(5000, 'mAh'), 18000); // 5000 mAh = 5 Ah = 18 000 C
  close(convert(5, 'Ah', 'mAh'), 5000);
});

test('pressure units', () => {
  close(convert(1013.25, 'hPa', 'Pa'), 101325);
  close(convert(1, 'atm', 'hPa'), 1013.25);
  close(convert(1, 'bar', 'kPa'), 100);
});

test('temperature conversions are affine and round-trip', () => {
  close(toSI(0, '°C'), 273.15);
  close(toSI(32, '°F'), 273.15);
  close(convert(100, '°C', '°F'), 212);
  close(convert(-40, '°C', '°F'), -40);
  for (const t of [-56.5, 0, 15, 45.2]) close(fromSI(toSI(t, '°C'), '°C'), t, 1e-12);
});

test('angular units', () => {
  close(convert(180, 'deg', 'rad'), Math.PI);
  close(toSI(60, 'rpm'), 2 * Math.PI);
});

test('round trip for every multiplicative unit', () => {
  for (const [dimension, definition] of Object.entries(DIMENSIONS)) {
    if (dimension === 'temperature') continue;
    for (const unit of Object.keys(definition.units)) {
      close(fromSI(toSI(12.345, unit), unit), 12.345, 1e-12);
    }
  }
});

test('rejects unknown units, mixed dimensions and non-finite values', () => {
  assert.throws(() => toSI(1, 'furlong'), UnitError);
  assert.throws(() => convert(1, 'kg', 'm'), UnitError);
  assert.throws(() => toSI(Number.NaN, 'kg'), UnitError);
  assert.throws(() => toSI(Infinity, 'm'), UnitError);
  assert.throws(() => unitsFor('luminosity'), UnitError);
});

test('dimension lookup', () => {
  assert.equal(dimensionOf('mAh'), 'charge');
  assert.equal(dimensionOf('m/s'), 'speed');
  assert.ok(unitsFor('mass').includes('g'));
});
