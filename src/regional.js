// -----------------------------------------------------------------------------
// éCO2mix by region: the real-time electricity of the twelve regions of
// mainland France (Corsica is not in it), published by RTE on ODRÉ, dataset
// `eco2mix-regional-tr`. Same API as the national one, no account and no key;
// one row per region and per quarter-hour, in MW. Unlike the national data,
// there is no CO₂ intensity per region (it depends on the exchanges).
//
// The rows of the current day exist ahead of time, all empty, and the last
// quarter-hours arrive about an hour late: the client asks for the rows with
// a consumption and keeps, per region, the most recent COMPLETE one.
// -----------------------------------------------------------------------------

import { requestJson, HttpError } from './http.js';
import { toNumber } from './eco2mix.js';

export const REGIONAL_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-regional-tr/records';

/** The regions of the dataset: INSEE code → name (as RTE writes it). */
export const REGIONS = {
  11: 'Île-de-France',
  24: 'Centre-Val de Loire',
  27: 'Bourgogne-Franche-Comté',
  28: 'Normandie',
  32: 'Hauts-de-France',
  44: 'Grand Est',
  52: 'Pays de la Loire',
  53: 'Bretagne',
  75: 'Nouvelle-Aquitaine',
  76: 'Occitanie',
  84: 'Auvergne-Rhône-Alpes',
  93: "Provence-Alpes-Côte d'Azur",
};

/** The quarter-hours we read back from, per region. */
const ROWS = 8;
/** The most rows the API returns at once. */
const API_LIMIT = 100;

/** The production sources of a row, in MW (the pumping and the batteries left out). */
export const REGIONAL_SOURCES = {
  nuclear: 'nucleaire',
  hydro: 'hydraulique',
  wind: 'eolien',
  solar: 'solaire',
  bioenergy: 'bioenergies',
  thermal: 'thermique',
};

const RENEWABLE = ['hydro', 'wind', 'solar', 'bioenergy'];

const REQUIRED = ['consommation', 'ech_physiques', ...Object.values(REGIONAL_SOURCES)];

/**
 * Query string of the request: the newest rows of the regions that have a
 * consumption.
 * @param {string[]} codes INSEE codes, from REGIONS
 */
export function regionalQuery(codes) {
  const list = codes.map((code) => `"${code}"`).join(', ');
  return new URLSearchParams({
    where: `code_insee_region in (${list}) and consommation is not null`,
    order_by: 'date_heure desc',
    limit: String(Math.min(API_LIMIT, ROWS * codes.length)),
  }).toString();
}

/**
 * Read the latest complete quarter-hour of each region.
 * @param {typeof fetch} fetchImpl
 * @param {string[]} codes
 * @returns {Promise<Record<string, ReturnType<typeof parseRegionalRecord>>>}
 */
export async function fetchRegionalMixes(fetchImpl, codes) {
  if (codes.length === 0) {
    return {};
  }
  const body = await requestJson(
    fetchImpl,
    `${REGIONAL_URL}?${regionalQuery(codes)}`,
    { headers: { accept: 'application/json' } },
    'éCO2mix regional',
  );
  return latestRegionalMixes(body, codes);
}

/**
 * The most recent complete row of each region of an ODRÉ answer. A region
 * without one is left out.
 * @param {unknown} body `{ total_count, results: [...] }`
 * @param {string[]} codes
 */
export function latestRegionalMixes(body, codes) {
  if (!body || !Array.isArray(body.results)) {
    throw new HttpError('éCO2mix regional answered without a list of results');
  }
  const latest = {};
  for (const record of body.results) {
    const mix = parseRegionalRecord(record);
    if (!mix || !codes.includes(mix.region)) {
      continue;
    }
    if (!latest[mix.region] || Date.parse(mix.at) > Date.parse(latest[mix.region].at)) {
      latest[mix.region] = mix;
    }
  }
  return latest;
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Turn one row into the figures the integration publishes. Returns null for
 * an incomplete row.
 * @param {Record<string, unknown>} record
 * @returns {{
 *   region: string,
 *   at: string,
 *   consumptionMw: number,
 *   productionMw: number,
 *   exchangesMw: number,
 *   coveragePercent: number,
 *   sharesPercent: Record<keyof typeof REGIONAL_SOURCES, number>,
 *   renewablePercent: number,
 *   lowCarbonPercent: number,
 * } | null}
 */
export function parseRegionalRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const region = String(record.code_insee_region ?? '');
  const at = Date.parse(record.date_heure);
  if (
    !REGIONS[region] ||
    !Number.isFinite(at) ||
    REQUIRED.some((field) => toNumber(record[field]) === null)
  ) {
    return null;
  }
  const consumptionMw = toNumber(record.consommation);
  const mw = Object.fromEntries(
    Object.entries(REGIONAL_SOURCES).map(([key, field]) => [
      key,
      Math.max(0, toNumber(record[field])),
    ]),
  );
  const productionMw = Object.values(mw).reduce((sum, value) => sum + value, 0);
  if (consumptionMw <= 0) {
    return null;
  }
  // A region may produce nothing at night (no plant, no sun): shares of 0.
  const share = (value) => (productionMw > 0 ? round1((value / productionMw) * 100) : 0);
  const renewableMw = RENEWABLE.reduce((sum, key) => sum + mw[key], 0);
  return {
    region,
    at: new Date(at).toISOString(),
    consumptionMw,
    productionMw,
    // With the neighbouring regions and countries: positive when the region
    // imports, negative when it exports.
    exchangesMw: toNumber(record.ech_physiques),
    // What the region produces, out of what it consumes (above 100: it exports).
    coveragePercent: round1((productionMw / consumptionMw) * 100),
    sharesPercent: Object.fromEntries(Object.entries(mw).map(([key, v]) => [key, share(v)])),
    renewablePercent: share(renewableMw),
    lowCarbonPercent: share(renewableMw + mw.nuclear),
  };
}
