// -----------------------------------------------------------------------------
// The two devices and their states.
//
//   - "French power grid" (éCO2mix, always offered):
//       grid-carbon-sensor/carbon-intensity  CO₂ intensity, g CO₂eq/kWh
//       energy-sensor/power                   national consumption, kW (Gladys
//                                             has no MW or GW unit)
//       grid-carbon-sensor/carbon-free-percentage, /renewable-percentage
//                                             the low-carbon and renewable shares
//       counter-sensor/integer + percent      the share of each source, and the
//                                             exchanges (import +, export −):
//                                             Gladys has no generic percentage
//                                             sensor; integers, like Pi-hole's
//                                             blocked share (the widget shows
//                                             the decimal)
//   - "EcoWatt" (only with the RTE key): risk/integer, the EcoWatt levels as
//     RTE publishes them, so a scene compares them with the numbers of the
//     RTE documentation: day 1 green, 2 orange, 3 red; hour 0 carbon-free,
//     1 green, 2 orange, 3 red. The Gladys badge of the risk category reads
//     0 "no risk", 1 "low", 2 "medium", 3 "high".
//
// Ids are built from a fixed platform id ("france"): there is one French
// grid, and the external ids must never change.
//
// Both devices declare a one-minute poll (the core's onPoll is a fallback of
// the container's own timer, src/poller.js): the data moves every 15 minutes
// and the current EcoWatt hour on the hour, a cheap tick every minute covers
// both without calling RTE more than the quotas allow.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { hasEcowatt } from './config.js';
import { NAMES } from './i18n.js';
import { levelsAt } from './ecowatt.js';

export const GRID = 'grid';
export const ECOWATT = 'ecowatt';
const PLATFORM_ID = 'france';

/** Feature keys: frozen once published (Gladys keys history and scenes on them). */
export const GRID_FEATURES = [
  'carbon_intensity',
  'consumption',
  'low_carbon_share',
  'renewable_share',
  'nuclear_share',
  'hydro_share',
  'wind_share',
  'solar_share',
  'bioenergy_share',
  'gas_share',
  'coal_share',
  'exchanges_share',
];
export const ECOWATT_FEATURES = ['today', 'tomorrow', 'current_hour'];

/** The sources published one by one, mix key → feature key. */
const SOURCE_FEATURES = {
  nuclear: 'nuclear_share',
  hydro: 'hydro_share',
  wind: 'wind_share',
  solar: 'solar_share',
  bioenergy: 'bioenergy_share',
  gas: 'gas_share',
  coal: 'coal_share',
};

/** A mix older than this is not published: better no value than a stale one. */
export const MIX_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** France's record consumption is about 102 GW: display bound, in kW. */
const CONSUMPTION_MAX_KW = 150_000_000;

export const deviceIds = (gladys, type) => gladys.externalIds(type, PLATFORM_ID);

const base = { read_only: true, has_feedback: false, keep_history: true };

function feature(ids, names, key, definition) {
  return { ...base, ...definition, name: names[key], external_id: ids.feature(key) };
}

/**
 * The discovery payload: the grid always, EcoWatt with a key.
 * @param {object} gladys
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function buildDevices(gladys, config) {
  const names = NAMES[config.language] ?? NAMES.fr;
  const devices = [buildGridDevice(gladys, names)];
  if (hasEcowatt(config)) {
    devices.push(buildEcowattDevice(gladys, names));
  }
  return devices;
}

function buildGridDevice(gladys, names) {
  const ids = deviceIds(gladys, GRID);
  const share = (key) =>
    feature(ids, names, key, {
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
    });
  return {
    name: names.grid,
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      feature(ids, names, 'carbon_intensity', {
        category: DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        type: DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.CARBON_INTENSITY,
        unit: DEVICE_FEATURE_UNITS.GRAM_CO2_EQ_PER_KILOWATT_HOUR,
        min: 0,
        max: 1000,
      }),
      feature(ids, names, 'consumption', {
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
        unit: DEVICE_FEATURE_UNITS.KILOWATT,
        min: 0,
        max: CONSUMPTION_MAX_KW,
      }),
      feature(ids, names, 'low_carbon_share', {
        category: DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        type: DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.CARBON_FREE_PERCENTAGE,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
      }),
      feature(ids, names, 'renewable_share', {
        category: DEVICE_FEATURE_CATEGORIES.GRID_CARBON_SENSOR,
        type: DEVICE_FEATURE_TYPES.GRID_CARBON_SENSOR.RENEWABLE_PERCENTAGE,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
      }),
      ...Object.values(SOURCE_FEATURES).map(share),
      // Signed: symmetric display bounds.
      { ...share('exchanges_share'), min: -100, max: 100 },
    ],
  };
}

function buildEcowattDevice(gladys, names) {
  const ids = deviceIds(gladys, ECOWATT);
  const level = (key, min) =>
    feature(ids, names, key, {
      category: DEVICE_FEATURE_CATEGORIES.RISK,
      type: DEVICE_FEATURE_TYPES.RISK.INTEGER,
      min,
      max: 3,
    });
  return {
    name: names.ecowatt,
    external_id: ids.device,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [level('today', 1), level('tomorrow', 1), level('current_hour', 0)],
  };
}

/**
 * The states of the grid device, from a parsed mix (none when it is stale).
 * @param {object} gladys
 * @param {ReturnType<import('./eco2mix.js').parseMixRecord>} mix
 * @param {number} now
 */
export function gridStates(gladys, mix, now) {
  if (!mix || now - Date.parse(mix.at) > MIX_MAX_AGE_MS) {
    return [];
  }
  const ids = deviceIds(gladys, GRID);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  return [
    state('carbon_intensity', Math.round(mix.co2)),
    state('consumption', Math.round(mix.consumptionMw * 1000)),
    state('low_carbon_share', Math.round(mix.lowCarbonPercent)),
    state('renewable_share', Math.round(mix.renewablePercent)),
    ...Object.entries(SOURCE_FEATURES).map(([source, key]) =>
      state(key, Math.round(mix.sharesPercent[source])),
    ),
    state('exchanges_share', Math.round(mix.exchangesPercent)),
  ];
}

/**
 * The states of the EcoWatt device at an instant (a level the signals do not
 * cover is left out).
 * @param {object} gladys
 * @param {ReturnType<import('./ecowatt.js').parseSignals> | null} signals
 * @param {number} now
 */
export function ecowattStates(gladys, signals, now) {
  const ids = deviceIds(gladys, ECOWATT);
  const levels = levelsAt(signals, now);
  return [
    ['today', levels.today],
    ['tomorrow', levels.tomorrow],
    ['current_hour', levels.hour],
  ]
    .filter(([, value]) => value !== null)
    .map(([key, value]) => ({ device_feature_external_id: ids.feature(key), state: value }));
}
