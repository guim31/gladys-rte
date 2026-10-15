// -----------------------------------------------------------------------------
// The EcoWatt client: OAuth2 client_credentials, the strict quota (one call
// every 15 minutes, remembered across restarts, Retry-After honoured), and the
// reading of the signals in French time.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CredentialsError,
  ECOWATT_MIN_INTERVAL_MS,
  QuotaError,
  SIGNALS_URL,
  TOKEN_URL,
  addDays,
  createEcowattClient,
  levelsAt,
  parisTime,
  parseSignals,
} from '../src/ecowatt.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  SIGNALS_BODY,
  START,
  TOKEN_BODY,
  createClock,
  createFakeRte,
} from './helpers/world.js';

const config = { ecowatt_client_id: CLIENT_ID, ecowatt_client_secret: CLIENT_SECRET };

function setup({ quota = {} } = {}) {
  const clock = createClock();
  const rte = createFakeRte();
  const saved = { ...quota };
  const client = createEcowattClient({
    fetch: rte.fetch,
    now: clock.now,
    loadQuota: () => saved,
    saveQuota: (next) => Object.assign(saved, next),
  });
  return { clock, rte, client, saved };
}

test('asks a token with the credentials as HTTP Basic, then the signals with it', async () => {
  const { rte, client } = setup();
  const signals = await client.fetchSignals(config);
  assert.equal(signals.days.length, 4);
  const [token, read] = rte.calls;
  assert.equal(token.url, TOKEN_URL);
  assert.equal(token.method, 'POST');
  assert.equal(
    token.headers.authorization,
    `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
  );
  assert.equal(token.body, 'grant_type=client_credentials');
  assert.equal(read.url, SIGNALS_URL);
  assert.equal(read.headers.authorization, `Bearer ${TOKEN_BODY.access_token}`);
});

test('never calls the signals twice within 15 minutes', async () => {
  const { clock, rte, client } = setup();
  await client.fetchSignals(config);
  clock.advance(ECOWATT_MIN_INTERVAL_MS - 1000);
  await assert.rejects(client.fetchSignals(config), QuotaError);
  assert.equal(rte.count('signals'), 1, 'nothing sent');
  clock.advance(1000);
  await client.fetchSignals(config);
  assert.equal(rte.count('signals'), 2);
  assert.equal(rte.count('token'), 1, 'the token is reused while valid');
});

test('the quota survives a restart: it is read from what /data kept', async () => {
  const { rte, client } = setup({ quota: { lastCallAt: START - 5 * 60 * 1000 } });
  await assert.rejects(client.fetchSignals(config), (err) => {
    assert.ok(err instanceof QuotaError);
    assert.equal(err.waitMs, 10 * 60 * 1000);
    return true;
  });
  assert.equal(rte.calls.length, 0, 'not even a token');
});

test('a 429 waits for its Retry-After, and never less than the quota', async () => {
  const { clock, rte, client, saved } = setup();
  rte.signals = () =>
    new Response('{}', { status: 429, headers: { 'retry-after': String(40 * 60) } });
  await assert.rejects(client.fetchSignals(config), /HTTP 429/);
  assert.equal(saved.notBefore, START + 40 * 60 * 1000);
  clock.advance(39 * 60 * 1000);
  assert.ok(client.quotaWait() > 0);
  clock.advance(60 * 1000);
  assert.equal(client.quotaWait(), 0);

  rte.signals = () => new Response('{}', { status: 429 });
  await assert.rejects(client.fetchSignals(config), /HTTP 429/);
  assert.equal(client.quotaWait(), ECOWATT_MIN_INTERVAL_MS);
});

test('refused credentials are a CredentialsError, and cost no quota', async () => {
  const { rte, client, saved } = setup();
  const wrong = { ...config, ecowatt_client_secret: 'nope' };
  await assert.rejects(client.fetchSignals(wrong), (err) => {
    assert.ok(err instanceof CredentialsError);
    assert.doesNotMatch(err.message, /nope|my-client-id/);
    return true;
  });
  assert.equal(rte.count('signals'), 0);
  assert.equal(saved.lastCallAt, undefined);
  await assert.rejects(client.checkCredentials(wrong), CredentialsError);
  await client.checkCredentials(config);
});

test('a token refused by the signals is asked again at the next call', async () => {
  const { clock, rte, client } = setup();
  await client.fetchSignals(config);
  const signals = rte.signals;
  rte.signals = () => new Response('{}', { status: 401 });
  clock.advance(ECOWATT_MIN_INTERVAL_MS);
  await assert.rejects(client.fetchSignals(config), /HTTP 401/);
  rte.signals = signals;
  clock.advance(ECOWATT_MIN_INTERVAL_MS);
  await client.fetchSignals(config);
  assert.equal(rte.count('token'), 2);
});

test('the token is renewed before it expires, and on new credentials', async () => {
  const { clock, rte, client } = setup();
  await client.checkCredentials(config);
  clock.advance((TOKEN_BODY.expires_in - 30) * 1000);
  await client.fetchSignals(config);
  assert.equal(rte.count('token'), 2, 'expired within a minute: renewed');
  client.reset();
  clock.advance(ECOWATT_MIN_INTERVAL_MS);
  await client.fetchSignals(config);
  assert.equal(rte.count('token'), 3);
});

test('reads the days by their French date, with their hours', () => {
  const { days, generatedAt } = parseSignals(SIGNALS_BODY);
  assert.deepEqual(
    days.map((d) => [d.date, d.level]),
    [
      ['2026-10-14', 1],
      ['2026-10-15', 2],
      ['2026-10-16', 1],
      ['2026-10-17', 1],
    ],
  );
  assert.equal(days[1].hours[9], 2);
  assert.equal(days[0].hours[3], 0);
  assert.match(days[1].message, /Risque de coupures/);
  assert.equal(generatedAt, '2026-10-13T21:00:00.000Z');
});

test('ignores the malformed days and levels, refuses an answer without any', () => {
  const { days } = parseSignals({
    signals: [
      { jour: 'soon', dvalue: 1, values: [] },
      { jour: '2026-10-14T00:00:00+02:00', dvalue: 7, values: [] },
      {
        jour: '2026-10-15T00:00:00+02:00',
        dvalue: 3,
        values: [
          { pas: 0, hvalue: 3 },
          { pas: 24, hvalue: 1 },
          { pas: 1, hvalue: 9 },
        ],
      },
    ],
  });
  assert.deepEqual(days, [{ date: '2026-10-15', level: 3, message: '', hours: { 0: 3 } }]);
  assert.throws(() => parseSignals({ signals: [] }), /without any usable day/);
  assert.throws(() => parseSignals({ error: 'x' }), /without a list/);
});

test('today, tomorrow and the hour are French ones, whatever the time zone', () => {
  const signals = parseSignals(SIGNALS_BODY);
  // 2026-10-14 23:30 UTC is already the 15th, 01:30, in Paris.
  const night = Date.UTC(2026, 9, 14, 23, 30);
  assert.deepEqual(parisTime(night), { date: '2026-10-15', hour: 1 });
  assert.deepEqual(levelsAt(signals, night), { today: 2, tomorrow: 1, hour: 1 });
  // 09:30 in Paris on the 15th: an orange hour.
  assert.deepEqual(levelsAt(signals, Date.UTC(2026, 9, 15, 7, 30)).hour, 2);
  // Winter time: 2026-12-01 12:00 UTC is 13:00 in Paris.
  assert.deepEqual(parisTime(Date.UTC(2026, 11, 1, 12)), { date: '2026-12-01', hour: 13 });
  // Beyond the data: nothing rather than a guess.
  assert.deepEqual(levelsAt(signals, Date.UTC(2026, 9, 20, 12)), {
    today: null,
    tomorrow: null,
    hour: null,
  });
  assert.deepEqual(levelsAt(null, START), { today: null, tomorrow: null, hour: null });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
