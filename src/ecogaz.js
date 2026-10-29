// -----------------------------------------------------------------------------
// EcoGaz: the signal of the French gas network (GRTgaz/NaTran and Teréga), the
// gas twin of EcoWatt, published on ODRÉ, dataset `signal-ecogaz`. Open data,
// no account and no key; one row per gas day, from today to four days ahead,
// updated once a day around 11:00.
//
// GRTgaz numbers its colors 1 green, 2 yellow, 3 orange, 4 red. The
// integration publishes them minus one (0 to 3): the risk badge of Gladys
// shows 0 green "no risk", 1 yellow "low", 2 orange "medium", 3 red "high",
// the very colors of EcoGaz.
// -----------------------------------------------------------------------------

import { requestJson, HttpError } from './http.js';
import { addDays, parisTime } from './ecowatt.js';

export const ECOGAZ_URL =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/signal-ecogaz/records';

export const GAS_LEVELS = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

/** The color of a level, as the trigger and the docs name it. */
export const GAS_COLORS = ['green', 'yellow', 'orange', 'red'];

/** The days read: enough rows to cover today and the four next days. */
const ROWS = 8;

export function ecogazQuery() {
  return new URLSearchParams({ order_by: 'gas_day desc', limit: String(ROWS) }).toString();
}

/**
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<ReturnType<typeof parseEcogaz>>}
 */
export async function fetchEcogaz(fetchImpl) {
  const body = await requestJson(
    fetchImpl,
    `${ECOGAZ_URL}?${ecogazQuery()}`,
    { headers: { accept: 'application/json' } },
    'EcoGaz',
  );
  return parseEcogaz(body);
}

/** A color index of GRTgaz (1 to 4, number or string) as a level 0 to 3, or null. */
function toLevel(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 1 && index <= 4 ? index - 1 : null;
}

/**
 * The days of an ODRÉ answer, oldest first.
 * @param {unknown} body `{ total_count, results: [{ gas_day, indice_de_couleur, ... }] }`
 * @returns {{ days: { date: string, level: number }[] }}
 */
export function parseEcogaz(body) {
  if (!body || !Array.isArray(body.results)) {
    throw new HttpError('EcoGaz answered without a list of results');
  }
  const days = body.results
    .map((row) => ({
      date: typeof row?.gas_day === 'string' ? row.gas_day.slice(0, 10) : '',
      level: toLevel(row?.indice_de_couleur),
    }))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && day.level !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (days.length === 0) {
    throw new HttpError('EcoGaz has no signal');
  }
  return { days };
}

/**
 * The level of today and of the next days at an instant (Paris dates), null
 * for a day the signals do not cover.
 * @param {ReturnType<typeof parseEcogaz> | null} signals
 * @param {number} instant
 * @returns {(number | null)[]} index 0 = today
 */
export function gasLevelsAt(signals, instant, count = 4) {
  const { date } = parisTime(instant);
  return Array.from(
    { length: count },
    (_, offset) => signals?.days.find((d) => d.date === addDays(date, offset))?.level ?? null,
  );
}
