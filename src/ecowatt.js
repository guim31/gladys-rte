// -----------------------------------------------------------------------------
// EcoWatt: RTE's signal of tension on the French grid, API v5 of the RTE data
// portal (data.rte-france.com). Free, but behind an application the user
// creates on the portal: OAuth2 client_credentials, the client id and secret
// sent as HTTP Basic to the token endpoint, a bearer token valid two hours.
//
// The signals cover today and the next three days (the fourth one appears
// during the morning): a level per day (`dvalue`) and per hour (`hvalue`,
// `pas` = the hour of the day, local French time):
//   0 = carbon-free production (hours only), 1 = normal (green),
//   2 = tight grid (orange), 3 = very tight, cuts possible (red).
//
// The quota is strict: ONE call to the signals every 15 minutes per
// application, a 429 otherwise. The client never calls sooner, remembers the
// last call under /data (a restart does not reset it) and honours the
// `Retry-After` of a 429.
// -----------------------------------------------------------------------------

import { requestJson, HttpError } from './http.js';

export const TOKEN_URL = 'https://digital.iservices.rte-france.com/token/oauth/';
export const SIGNALS_URL = 'https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals';

/** The quota of the signals endpoint. */
export const ECOWATT_MIN_INTERVAL_MS = 15 * 60 * 1000;

/** A token is renewed this long before it expires. */
const TOKEN_MARGIN_MS = 60 * 1000;

export const LEVELS = { CARBON_FREE: 0, GREEN: 1, ORANGE: 2, RED: 3 };

/** The credentials were refused by RTE (400/401 on the token). */
export class CredentialsError extends HttpError {
  constructor(status) {
    super(`EcoWatt refused the application credentials (HTTP ${status})`, { status });
    this.name = 'CredentialsError';
  }
}

/** A call the quota does not allow yet: nothing was sent. */
export class QuotaError extends Error {
  constructor(waitMs) {
    super(`EcoWatt quota: next call allowed in ${Math.ceil(waitMs / 60000)} min`);
    this.name = 'QuotaError';
    this.waitMs = waitMs;
  }
}

/**
 * @param {object} options
 * @param {typeof fetch} options.fetch
 * @param {() => number} [options.now]
 * @param {() => { lastCallAt?: number, notBefore?: number }} options.loadQuota
 * @param {(quota: { lastCallAt: number, notBefore: number }) => void} options.saveQuota
 */
export function createEcowattClient({
  fetch: fetchImpl,
  now = () => Date.now(),
  loadQuota,
  saveQuota,
}) {
  /** @type {{ key: string, value: string, expiresAt: number } | null} */
  let token = null;

  const credentialsKey = (config) => `${config.ecowatt_client_id}\n${config.ecowatt_client_secret}`;

  async function getToken(config) {
    const key = credentialsKey(config);
    if (token && token.key === key && token.expiresAt - TOKEN_MARGIN_MS > now()) {
      return token.value;
    }
    token = null;
    const basic = Buffer.from(
      `${config.ecowatt_client_id}:${config.ecowatt_client_secret}`,
      'utf8',
    ).toString('base64');
    let body;
    try {
      body = await requestJson(
        fetchImpl,
        TOKEN_URL,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${basic}`,
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: 'grant_type=client_credentials',
        },
        'EcoWatt (token)',
      );
    } catch (err) {
      if (err instanceof HttpError && [400, 401, 403].includes(err.status)) {
        throw new CredentialsError(err.status);
      }
      throw err;
    }
    if (typeof body?.access_token !== 'string' || body.access_token === '') {
      throw new HttpError('EcoWatt (token) answered without an access token');
    }
    const lifetimeS = Number(body.expires_in);
    token = {
      key,
      value: body.access_token,
      expiresAt: now() + (Number.isFinite(lifetimeS) && lifetimeS > 0 ? lifetimeS : 3600) * 1000,
    };
    return token.value;
  }

  /** Milliseconds before the quota allows the next call to the signals. */
  function quotaWait() {
    const { lastCallAt = 0, notBefore = 0 } = loadQuota() ?? {};
    const allowedAt = Math.max(lastCallAt + ECOWATT_MIN_INTERVAL_MS, notBefore);
    return Math.max(0, allowedAt - now());
  }

  return {
    quotaWait,

    /** Check the credentials alone: a token costs no quota. */
    async checkCredentials(config) {
      token = null;
      await getToken(config);
    },

    /**
     * Read the signals, unless the quota forbids it (QuotaError, nothing sent).
     * @returns {Promise<ReturnType<typeof parseSignals>>}
     */
    async fetchSignals(config) {
      const wait = quotaWait();
      if (wait > 0) {
        throw new QuotaError(wait);
      }
      const value = await getToken(config);
      // Counted from now on, whatever the answer: RTE counts the call.
      const calledAt = now();
      saveQuota({ lastCallAt: calledAt, notBefore: 0 });
      try {
        const body = await requestJson(
          fetchImpl,
          SIGNALS_URL,
          { headers: { authorization: `Bearer ${value}`, accept: 'application/json' } },
          'EcoWatt',
        );
        return parseSignals(body);
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          // Revoked or expired early: the next call asks for a new one.
          token = null;
        }
        if (err instanceof HttpError && err.status === 429) {
          saveQuota({
            lastCallAt: calledAt,
            notBefore: calledAt + Math.max(err.retryAfterMs ?? 0, ECOWATT_MIN_INTERVAL_MS),
          });
        }
        throw err;
      }
    },

    /** Forget the token (new credentials). */
    reset() {
      token = null;
    },
  };
}

const isLevel = (value, min) => Number.isInteger(value) && value >= min && value <= 3;

/**
 * Turn the API answer into days sorted by date. The date of a day is the
 * French calendar date written in `jour` ("2026-10-15T00:00:00+02:00").
 * @param {unknown} body `{ signals: [{ GenerationFichier, jour, dvalue, message, values }] }`
 * @returns {{ generatedAt: string | null, days: Array<{
 *   date: string, level: number, message: string, hours: Record<number, number>
 * }> }}
 */
export function parseSignals(body) {
  if (!body || !Array.isArray(body.signals)) {
    throw new HttpError('EcoWatt answered without a list of signals');
  }
  const days = [];
  let generatedAt = null;
  for (const signal of body.signals) {
    const date = /^(\d{4}-\d{2}-\d{2})T/.exec(String(signal?.jour ?? ''))?.[1];
    if (!date || !isLevel(signal.dvalue, 1)) {
      continue;
    }
    const hours = {};
    for (const entry of Array.isArray(signal.values) ? signal.values : []) {
      if (
        Number.isInteger(entry?.pas) &&
        entry.pas >= 0 &&
        entry.pas < 24 &&
        isLevel(entry.hvalue, 0)
      ) {
        hours[entry.pas] = entry.hvalue;
      }
    }
    const generated = Date.parse(signal.GenerationFichier);
    if (Number.isFinite(generated)) {
      const iso = new Date(generated).toISOString();
      generatedAt = generatedAt === null || iso > generatedAt ? iso : generatedAt;
    }
    days.push({
      date,
      level: signal.dvalue,
      message: typeof signal.message === 'string' ? signal.message.trim() : '',
      hours,
    });
  }
  if (days.length === 0) {
    throw new HttpError('EcoWatt answered without any usable day');
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { generatedAt, days };
}

const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * The French calendar date and hour of an instant: EcoWatt days and hours
 * are French ones, whatever the time zone of Gladys.
 * @param {number} instant
 * @returns {{ date: string, hour: number }}
 */
export function parisTime(instant) {
  const parts = Object.fromEntries(
    PARIS.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** `date` plus `days` calendar days, both "YYYY-MM-DD". */
export function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The levels of today, tomorrow and the current hour, at an instant. A level
 * the signals do not cover (stale data) is null.
 * @param {ReturnType<typeof parseSignals> | null} signals
 * @param {number} instant
 */
export function levelsAt(signals, instant) {
  const { date, hour } = parisTime(instant);
  const day = (offset) => signals?.days.find((d) => d.date === addDays(date, offset)) ?? null;
  const today = day(0);
  return {
    today: today?.level ?? null,
    tomorrow: day(1)?.level ?? null,
    hour: today?.hours[hour] ?? null,
  };
}
