// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle writes nothing at the info level, a failure that
// lasts writes one line when it starts and one when it ends, and no secret of
// the configuration ever reaches a log line, whatever the level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIX_PERIOD_MS, ECOWATT_PERIOD_MS } from '../src/app.js';
import { CLIENT_ID, CLIENT_SECRET, TOKEN_BODY, createAll, createWorld } from './helpers/world.js';

/** Capture what the loggers write, at a given LOG_LEVEL. */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.map(String).join(' ')));
  }
  return lines;
}

test('a normal cycle writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const lines = captureLogs(t, 'info');

  for (let i = 0; i < 4; i += 1) {
    world.clock.advance(MIX_PERIOD_MS);
    await world.app.tick();
    await world.fake.poll(world.fake.discoveredDevices[0]);
    await world.fake.widgetGet('grid', { settings: {}, language: 'fr', units: 'metric' });
  }
  assert.ok(world.rte.count('eco2mix') >= 5 && world.rte.count('signals') >= 3);
  assert.deepEqual(lines, []);
});

test('a lasting failure: one line when it starts, one when it ends', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const lines = captureLogs(t, 'info');
  const fakeRte = world.rte.eco2mix;
  world.rte.eco2mix = () => new Response('{}', { status: 503 });
  for (let i = 0; i < 5; i += 1) {
    world.clock.advance(MIX_PERIOD_MS);
    await world.app.tick();
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[WARN\].*éCO2mix cannot be read: éCO2mix answered HTTP 503/);
  world.rte.eco2mix = fakeRte;
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(lines.length, 2);
  assert.match(lines[1], /\[INFO\].*éCO2mix answers again/);
});

test('no secret of the configuration reaches the logs, even in debug', async (t) => {
  const lines = captureLogs(t, 'debug');
  // Refused, then accepted, then a token refused by the signals: every path
  // that could name the credentials.
  const world = await createWorld({
    config: {
      language: 'fr',
      ecowatt_client_id: CLIENT_ID,
      ecowatt_client_secret: 'wrong-secret-9999',
    },
  });
  t.after(() => world.app.stop());
  await world.fake.action('test_connection', {});
  await world.fake.configUpdated({
    language: 'fr',
    ecowatt_client_id: CLIENT_ID,
    ecowatt_client_secret: CLIENT_SECRET,
  });
  await createAll(world);
  world.rte.signals = () => new Response('{}', { status: 401 });
  world.clock.advance(ECOWATT_PERIOD_MS);
  await world.app.tick();
  await world.fake.action('test_connection', {});

  assert.ok(lines.length > 5, 'debug shows the cycle');
  const all = lines.join('\n');
  for (const secret of [
    CLIENT_SECRET,
    'wrong-secret-9999',
    TOKEN_BODY.access_token,
    Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
  ]) {
    assert.ok(!all.includes(secret), `a log line carries ${secret}`);
  }
});
