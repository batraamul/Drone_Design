/**
 * International Standard Atmosphere (ISA).
 *
 * Model: U.S. Standard Atmosphere 1976, identical to the ICAO Standard Atmosphere
 * (Doc 7488/3) below 32 km, using seven geopotential layers up to 84.852 km
 * geopotential (≈ 86 km geometric). Temperature varies linearly with geopotential
 * altitude in each layer; pressure follows from the hydrostatic equation and the
 * ideal-gas law; viscosity uses Sutherland's law.
 *
 * Provenance: analytical (standard model). The real atmosphere on any given day
 * differs from ISA; use the temperature deviation ΔT or measured soundings for
 * site-specific work.
 */

export const G0 = 9.80665; // standard gravity, m/s²
export const R_AIR = 287.05287; // specific gas constant of dry air, J/(kg·K)  (R*/M0 = 8.31432/0.0289644)
export const GAMMA = 1.4; // ratio of specific heats for air
export const EARTH_RADIUS = 6356766; // effective Earth radius for geopotential altitude, m
export const T0 = 288.15; // sea-level temperature, K
export const P0 = 101325; // sea-level pressure, Pa
export const RHO0 = P0 / (R_AIR * T0); // sea-level density, ≈ 1.225 kg/m³
export const SUTHERLAND_BETA = 1.458e-6; // kg/(m·s·K^0.5)
export const SUTHERLAND_S = 110.4; // K

const LAYER_DEFINITIONS = [
  { name: 'Troposphere', base: 0, lapse: -0.0065 },
  { name: 'Tropopause', base: 11000, lapse: 0 },
  { name: 'Stratosphere (lower)', base: 20000, lapse: 0.001 },
  { name: 'Stratosphere (upper)', base: 32000, lapse: 0.0028 },
  { name: 'Stratopause', base: 47000, lapse: 0 },
  { name: 'Mesosphere (lower)', base: 51000, lapse: -0.0028 },
  { name: 'Mesosphere (upper)', base: 71000, lapse: -0.002 },
];

/** Upper limit of the model in geopotential metres. */
export const MAX_GEOPOTENTIAL_ALTITUDE = 84852;
export const MIN_GEOPOTENTIAL_ALTITUDE = geometricToGeopotential(-5000);

function layerPressure(layer, temperature, geopotential) {
  if (layer.lapse === 0) {
    return layer.basePressure * Math.exp((-G0 * (geopotential - layer.base)) / (R_AIR * layer.baseTemperature));
  }
  return layer.basePressure * (temperature / layer.baseTemperature) ** (-G0 / (R_AIR * layer.lapse));
}

/** Layer table with base temperature and pressure derived by integrating upward from sea level. */
export const LAYERS = (() => {
  const layers = [];
  let baseTemperature = T0;
  let basePressure = P0;
  LAYER_DEFINITIONS.forEach((definition, index) => {
    const layer = { ...definition, baseTemperature, basePressure };
    layers.push(Object.freeze(layer));
    const top = index + 1 < LAYER_DEFINITIONS.length ? LAYER_DEFINITIONS[index + 1].base : MAX_GEOPOTENTIAL_ALTITUDE;
    const topTemperature = baseTemperature + definition.lapse * (top - definition.base);
    basePressure = layerPressure(layer, topTemperature, top);
    baseTemperature = topTemperature;
  });
  return Object.freeze(layers);
})();

export function geometricToGeopotential(z) {
  return (EARTH_RADIUS * z) / (EARTH_RADIUS + z);
}

export function geopotentialToGeometric(h) {
  return (EARTH_RADIUS * h) / (EARTH_RADIUS - h);
}

export const MIN_ALTITUDE = -5000;
export const MAX_ALTITUDE = geopotentialToGeometric(MAX_GEOPOTENTIAL_ALTITUDE);

function findLayer(geopotential) {
  for (let i = LAYERS.length - 1; i >= 0; i -= 1) {
    if (geopotential >= LAYERS[i].base) return LAYERS[i];
  }
  return LAYERS[0]; // below sea level: troposphere gradient extended downward
}

/** Sutherland's law for the dynamic viscosity of air, Pa·s. */
export function sutherlandViscosity(temperature) {
  return (SUTHERLAND_BETA * temperature ** 1.5) / (temperature + SUTHERLAND_S);
}

/**
 * Atmospheric properties at an altitude.
 *
 * @param {number} altitude  metres; geometric unless options.geopotential is true
 * @param {{geopotential?: boolean, deltaT?: number}} [options]
 *   deltaT: ISA temperature deviation in kelvin. When non-zero the altitude is treated as a
 *   pressure altitude: pressure is the ISA value, temperature is ISA + ΔT, density follows
 *   from the ideal-gas law.
 */
export function isa(altitude, { geopotential = false, deltaT = 0 } = {}) {
  if (typeof altitude !== 'number' || !Number.isFinite(altitude)) {
    throw new RangeError('Altitude must be a finite number of metres');
  }
  if (typeof deltaT !== 'number' || !Number.isFinite(deltaT)) {
    throw new RangeError('Temperature deviation must be a finite number of kelvin');
  }
  const h = geopotential ? altitude : geometricToGeopotential(altitude);
  const z = geopotential ? geopotentialToGeometric(altitude) : altitude;
  if (h < MIN_GEOPOTENTIAL_ALTITUDE - 1e-6 || h > MAX_GEOPOTENTIAL_ALTITUDE + 1e-6) {
    throw new RangeError(
      `Altitude outside the ISA model range (${MIN_ALTITUDE} m to ${Math.round(MAX_ALTITUDE)} m geometric)`,
    );
  }
  const layer = findLayer(h);
  const isaTemperature = layer.baseTemperature + layer.lapse * (h - layer.base);
  const pressure = layerPressure(layer, isaTemperature, h);
  const temperature = isaTemperature + deltaT;
  if (temperature <= 0) throw new RangeError('Temperature deviation gives a non-physical absolute temperature');
  const density = pressure / (R_AIR * temperature);
  const dynamicViscosity = sutherlandViscosity(temperature);
  return {
    altitude: z,
    geopotentialAltitude: h,
    layer: layer.name,
    deltaT,
    temperature,
    pressure,
    density,
    speedOfSound: Math.sqrt(GAMMA * R_AIR * temperature),
    dynamicViscosity,
    kinematicViscosity: dynamicViscosity / density,
    temperatureRatio: temperature / T0,
    pressureRatio: pressure / P0,
    densityRatio: density / RHO0,
  };
}

/**
 * Density altitude: the ISA altitude (geopotential, m) at which the standard density equals `density`.
 * Valid in the troposphere only (0.0 ≤ result ≤ 11 km and slightly below sea level).
 */
export function densityAltitude(density) {
  if (typeof density !== 'number' || !(density > 0)) throw new RangeError('Density must be a positive number');
  const lapse = -LAYERS[0].lapse;
  const exponent = G0 / (R_AIR * lapse) - 1;
  const h = (T0 / lapse) * (1 - (density / RHO0) ** (1 / exponent));
  if (h > LAYERS[1].base || h < MIN_GEOPOTENTIAL_ALTITUDE) {
    throw new RangeError('Density altitude is only defined here for the troposphere (−5 km to 11 km)');
  }
  return h;
}
