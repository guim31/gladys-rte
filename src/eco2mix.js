// -----------------------------------------------------------------------------
// éCO2mix: the real-time electricity mix of mainland France, published by RTE
// on ODRÉ (Open Data Réseaux Énergies), dataset `eco2mix-national-tr`. Open
// data, no account and no key; one row per quarter-hour, in MW, and the CO₂
// intensity of the electricity produced in France in g/kWh.
//
// The rows of the current day exist ahead of time with empty production
// values (only the consumption forecasts are filled in), and the last
// quarter-hours arrive with a delay of about an hour: the client asks for the
// last few rows with a CO₂ value, and keeps the most recent COMPLETE one.
// -----------------------------------------------------------------------------

import { requestJson, HttpError } from './http.js';

export const ECO2MIX_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-national-tr/records';

/** The quarter-hours we read back from, to step over the incomplete ones. */
const ROWS = 8;

/** The production sources of a row, in MW, as they add up to the production. */
const SOURCES = {
  nuclear: 'nucleaire',
  hydro: 'hydraulique',
  wind: 'eolien',
  solar: 'solaire',
  gas: 'gaz',
  coal: 'charbon',
  oil: 'fioul',
  bioenergy: 'bioenergies',
};

/** RTE counts these four as renewable; low-carbon adds the nuclear. */
const RENEWABLE = ['hydro', 'wind', 'solar', 'bioenergy'];

/** The fields a row must carry to be used. */
const REQUIRED = ['consommation', 'taux_co2', ...Object.values(SOURCES)];

/** Query string of the request: the newest rows that have a CO₂ value. */
export function eco2mixQuery() {
  return new URLSearchParams({
    where: 'taux_co2 is not null',
    order_by: 'date_heure desc',
    limit: String(ROWS),
  }).toString();
}

/**
 * Read the latest complete quarter-hour.
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<ReturnType<typeof parseMixRecord>>}
 */
export async function fetchLatestMix(fetchImpl) {
  const body = await requestJson(
    fetchImpl,
    `${ECO2MIX_URL}?${eco2mixQuery()}`,
    { headers: { accept: 'application/json' } },
    'éCO2mix',
  );
  return latestMix(body);
}

/**
 * The most recent complete row of an ODRÉ answer.
 * @param {unknown} body `{ total_count, results: [...] }`
 */
export function latestMix(body) {
  if (!body || !Array.isArray(body.results)) {
    throw new HttpError('éCO2mix answered without a list of results');
  }
  const mixes = body.results
    .map((record) => parseMixRecord(record))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (mixes.length === 0) {
    throw new HttpError('éCO2mix has no complete quarter-hour yet');
  }
  return mixes[0];
}

/**
 * A number from the API: a number, a numeric string, or nothing (`null`,
 * "ND", "-" mean "not available").
 * @param {unknown} value
 * @returns {number | null}
 */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Turn one row into the figures the integration publishes. Returns null for
 * an incomplete row.
 * @param {Record<string, unknown>} record
 * @returns {{
 *   at: string,
 *   consumptionMw: number,
 *   productionMw: number,
 *   exchangesMw: number,
 *   co2: number,
 *   sharesPercent: Record<keyof typeof SOURCES, number>,
 *   exchangesPercent: number,
 *   renewablePercent: number,
 *   lowCarbonPercent: number,
 * } | null}
 */
export function parseMixRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const at = Date.parse(record.date_heure);
  if (!Number.isFinite(at) || REQUIRED.some((field) => toNumber(record[field]) === null)) {
    return null;
  }
  const consumptionMw = toNumber(record.consommation);
  const co2 = toNumber(record.taux_co2);
  // A source is never negative in the mix: the pumping of the pumped-storage
  // plants is its own column (`pompage`), left out of the production.
  const mw = Object.fromEntries(
    Object.entries(SOURCES).map(([key, field]) => [key, Math.max(0, toNumber(record[field]))]),
  );
  const productionMw = Object.values(mw).reduce((sum, value) => sum + value, 0);
  if (consumptionMw <= 0 || productionMw <= 0 || co2 < 0) {
    return null;
  }
  // Physical exchanges: positive when France imports, negative when it exports.
  const exchangesMw = toNumber(record.ech_physiques) ?? 0;
  const share = (value) => round1((value / productionMw) * 100);
  const sharesPercent = Object.fromEntries(Object.entries(mw).map(([key, v]) => [key, share(v)]));
  const renewableMw = RENEWABLE.reduce((sum, key) => sum + mw[key], 0);
  return {
    at: new Date(at).toISOString(),
    consumptionMw,
    productionMw,
    exchangesMw,
    co2,
    sharesPercent,
    // Of the consumption: what the neighbours supply, or take (negative).
    exchangesPercent: Math.max(-100, Math.min(100, round1((exchangesMw / consumptionMw) * 100))),
    renewablePercent: share(renewableMw),
    lowCarbonPercent: share(renewableMw + mw.nuclear),
  };
}
