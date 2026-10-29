// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake RTE (éCO2mix and
// EcoWatt behind one fake `fetch`), a temporary /data and a manual clock, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests call `app.tick()`.
// No test touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { ECO2MIX_URL } from '../../src/eco2mix.js';
import { SIGNALS_URL, TOKEN_URL } from '../../src/ecowatt.js';
import { REGIONAL_URL } from '../../src/regional.js';
import { ECOGAZ_URL } from '../../src/ecogaz.js';
import { deviceIds, regionIds, GRID, ECOWATT, ECOGAZ } from '../../src/devices.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

export const ECO2MIX_BODY = fixture('eco2mix-national-tr.json');
export const SIGNALS_BODY = fixture('ecowatt-signals.json');
export const TOKEN_BODY = fixture('ecowatt-token.json');
/** Real ODRÉ answers (28/10/2026): Île-de-France, Centre-Val de Loire, Occitanie. */
export const REGIONAL_BODY = fixture('eco2mix-regional-tr.json');
/** Real ODRÉ answer (28/10/2026): green from 26/10 to 02/11. */
export const ECOGAZ_BODY = fixture('signal-ecogaz.json');
/** 2026-10-29 01:45 in Paris (UTC+1): an hour after the last regional quarter-hour. */
export const GAS_START = Date.UTC(2026, 9, 29, 0, 45, 0);
/** The last complete quarter-hour of the regional fixture (00:45 in Paris). */
export const REGIONAL_AT = '2026-10-28T23:45:00.000Z';

/** 2026-10-14 15:20 in Paris (UTC+2): an hour after the last quarter-hour of éCO2mix. */
export const START = Date.UTC(2026, 9, 14, 13, 20, 0);
/** The last complete quarter-hour of the éCO2mix fixture (14:15 in Paris). */
export const MIX_AT = '2026-10-14T12:15:00.000Z';

export const CLIENT_ID = 'my-client-id-1234';
export const CLIENT_SECRET = 'my-very-secret-value-5678';

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/**
 * A fake RTE. Its answers can be changed between two calls; every call is
 * recorded (url, method, headers).
 */
export function createFakeRte() {
  const rte = {
    calls: [],
    eco2mix: () => json(200, ECO2MIX_BODY),
    regional: () => json(200, REGIONAL_BODY),
    ecogaz: () => json(200, ECOGAZ_BODY),
    token: (request) => {
      const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
      return request.headers.authorization === expected
        ? json(200, TOKEN_BODY)
        : json(401, { error: 'invalid_client', error_description: 'Bad credentials' });
    },
    signals: (request) =>
      request.headers.authorization === `Bearer ${TOKEN_BODY.access_token}`
        ? json(200, SIGNALS_BODY)
        : json(401, { error: 'invalid_token' }),
    /** @type {typeof fetch} */
    fetch: async (url, init = {}) => {
      const request = {
        url: String(url),
        method: init.method ?? 'GET',
        headers: Object.fromEntries(
          Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        body: init.body,
      };
      rte.calls.push(request);
      if (request.url.startsWith(ECO2MIX_URL)) {
        return rte.eco2mix(request);
      }
      if (request.url.startsWith(REGIONAL_URL)) {
        return rte.regional(request);
      }
      if (request.url.startsWith(ECOGAZ_URL)) {
        return rte.ecogaz(request);
      }
      if (request.url === TOKEN_URL) {
        return rte.token(request);
      }
      if (request.url === SIGNALS_URL) {
        return rte.signals(request);
      }
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    },
    count: (kind) =>
      rte.calls.filter((c) => {
        const prefix = { eco2mix: ECO2MIX_URL, regional: REGIONAL_URL, ecogaz: ECOGAZ_URL }[kind];
        return prefix
          ? c.url.startsWith(prefix)
          : c.url === (kind === 'token' ? TOKEN_URL : SIGNALS_URL);
      }).length,
  };
  return rte;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  clock = createClock(),
  rte = createFakeRte(),
  config = {
    language: 'fr',
    ecowatt_client_id: CLIENT_ID,
    ecowatt_client_secret: CLIENT_SECRET,
  },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-rte-')),
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: rte.fetch,
    store: new Store(dataDir),
    now: clock.now,
    timers,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, rte, app, clock, dataDir };
}

export const gridId = (gladys) => deviceIds(gladys, GRID);
export const ecowattId = (gladys) => deviceIds(gladys, ECOWATT);
export const ecogazId = (gladys) => deviceIds(gladys, ECOGAZ);
export const regionId = (gladys, code) => regionIds(gladys, code);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The discovered devices of a configuration, for a world where they exist. */
export async function discoveredDevices(config) {
  const world = await createWorld({ config, connect: true });
  const devices = world.fake.discoveredDevices;
  await world.app.stop();
  return devices;
}
