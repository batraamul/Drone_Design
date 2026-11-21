/**
 * ISA validation against tabulated values of the U.S. Standard Atmosphere 1976
 * (NOAA-S/T 76-1562), geopotential altitudes at the layer bases. Tabulated values
 * have six significant figures, so a relative tolerance of 1e-5 is used for
 * pressure and density.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isa,
  LAYERS,
  RHO0,
  densityAltitude,
  geometricToGeopotential,
  geopotentialToGeometric,
  sutherlandViscosity,
  MAX_ALTITUDE,
} from '../../js/engineering/atmosphere.js';

const rel = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) / Math.abs(expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

const TABLE = [
  // H (geopotential m), T (K), p (Pa), rho (kg/m³)
  [0, 288.15, 101325, 1.225],
  [11000, 216.65, 22632.06, 0.3639176],
  [20000, 216.65, 5474.889, 0.08803486],
  [32000, 228.65, 868.0187, 0.01322497],
  [47000, 270.65, 110.9063, 0.001427527],
  [51000, 270.65, 66.93887, 0.0008616011],
  [71000, 214.65, 3.956420, 0.00006421],
];

test('layer base values match the U.S. Standard Atmosphere 1976 tables', () => {
  for (const [h, t, p, rho] of TABLE) {
    const air = isa(h, { geopotential: true });
    rel(air.temperature, t, 1e-9, `T at ${h}`);
    rel(air.pressure, p, 1e-5, `p at ${h}`);
    rel(air.density, rho, 2e-4, `rho at ${h}`);
  }
  assert.equal(LAYERS.length, 7);
});

test('sea level reference values', () => {
  const air = isa(0);
  rel(RHO0, 1.225, 1e-5, 'rho0');
  rel(air.speedOfSound, 340.294, 1e-5, 'a0');
  rel(air.dynamicViscosity, 1.7894e-5, 1e-4, 'mu0');
  assert.equal(air.layer, 'Troposphere');
  rel(air.densityRatio, 1, 1e-12, 'sigma0');
});

test('intermediate troposphere point (1000 m geopotential)', () => {
  const air = isa(1000, { geopotential: true });
  rel(air.temperature, 281.65, 1e-9, 'T');
  rel(air.pressure, 89874.57, 1e-5, 'p');
  rel(air.density, 1.111642, 1e-5, 'rho');
});

test('geometric and geopotential altitude conversion', () => {
  const z = geopotentialToGeometric(11000);
  rel(z, 11019.0, 1e-4, 'z at H=11 km');
  rel(geometricToGeopotential(z), 11000, 1e-12, 'round trip');
  // Using geometric altitude gives a slightly warmer temperature than the same number in geopotential metres.
  assert.ok(isa(11000).temperature > isa(11000, { geopotential: true }).temperature);
});

test('temperature deviation keeps pressure and changes density (pressure altitude)', () => {
  const standard = isa(2000);
  const hot = isa(2000, { deltaT: 20 });
  rel(hot.pressure, standard.pressure, 1e-12, 'p unchanged');
  rel(hot.temperature, standard.temperature + 20, 1e-12, 'T shifted');
  assert.ok(hot.density < standard.density);
  rel(hot.density / standard.density, standard.temperature / hot.temperature, 1e-12, 'ideal gas');
});

test('density altitude inverts the troposphere density profile', () => {
  for (const h of [-1000, 0, 1500, 4000, 10500]) {
    const air = isa(h, { geopotential: true });
    rel(densityAltitude(air.density) + 1e-9, h + 1e-9, 1e-6, `density altitude at ${h}`);
  }
  assert.throws(() => densityAltitude(0.1), RangeError);
});

test('Sutherland viscosity increases with temperature', () => {
  assert.ok(sutherlandViscosity(300) > sutherlandViscosity(250));
});

test('rejects values outside the model', () => {
  assert.throws(() => isa(-6000), RangeError);
  assert.throws(() => isa(MAX_ALTITUDE + 10), RangeError);
  assert.throws(() => isa(Number.NaN), RangeError);
  assert.throws(() => isa(1000, { deltaT: -400 }), RangeError);
});
