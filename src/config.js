// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a value typed by hand with stray spaces.
// -----------------------------------------------------------------------------

import { REGIONS } from './regional.js';

/** The languages of the Gladys interface, every text exists in all four. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Language of the feature names (frozen when a device is added) and of the
  // texts the container produces where Gladys does not say the user's
  // language (scene events, configuration messages).
  language: 'fr',
  // The EcoWatt application of the user on data.rte-france.com (optional:
  // without it, only the éCO2mix device exists).
  ecowatt_client_id: '',
  ecowatt_client_secret: '',
  // INSEE codes of the regions followed (éCO2mix regional): one device each.
  // No default in the manifest (a multi_select stores an array).
  regions: [],
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  return {
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    ecowatt_client_id: String(raw.ecowatt_client_id ?? '').trim(),
    // Pasted from the RTE portal: spaces and line breaks around it are noise.
    ecowatt_client_secret: String(raw.ecowatt_client_secret ?? '').trim(),
    regions: normalizeRegions(raw.regions),
  };
}

/**
 * The regions chosen: an array from the multi_select (a comma-separated
 * string is accepted too), unknown codes dropped, without duplicates.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeRegions(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const codes = list.map((code) => String(code).trim()).filter((code) => REGIONS[code]);
  return [...new Set(codes)].sort();
}

/**
 * EcoWatt is only read with both halves of the application credentials.
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function hasEcowatt(config) {
  return Boolean(config.ecowatt_client_id && config.ecowatt_client_secret);
}
