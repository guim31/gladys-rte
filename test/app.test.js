// -----------------------------------------------------------------------------
// The integration on the SDK's fake Gladys and a fake RTE: devices, states,
// the container's own refresh (Gladys#3198), the onPoll fallback, the
// heartbeat, the "EcoWatt alert announced" trigger, the connection status and
// the configuration action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOWATT_PERIOD_MS,
  HEARTBEAT_MS,
  MIX_PERIOD_MS,
  TICK_MS,
  TRIGGER_KEY,
} from '../src/app.js';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  SIGNALS_BODY,
  START,
  createAll,
  createFakeRte,
  createWorld,
  ecowattId,
  gridId,
} from './helpers/world.js';

/** Let the work started by a fired timer run to its end. */
async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const withSignals = (transform) => {
  const body = structuredClone(SIGNALS_BODY);
  transform(body.signals);
  return () => new Response(JSON.stringify(body), { status: 200 });
};

test('publishes the grid and the EcoWatt devices, then reads both APIs once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const names = world.fake.discoveredDevices.map((d) => d.name);
  assert.deepEqual(names, ['Réseau électrique français', 'EcoWatt']);
  assert.equal(world.rte.count('eco2mix'), 1);
  assert.equal(world.rte.count('signals'), 1);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('without the EcoWatt key: the grid device only, and RTE EcoWatt never called', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['French power grid'],
  );
  assert.equal(world.rte.count('token'), 0);
  assert.equal(world.rte.count('signals'), 0);
});

test('a device the user adds receives every state at once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.states.length, 0, 'nothing before the devices exist');
  await createAll(world);

  const grid = gridId(world.gladys);
  const ecowatt = ecowattId(world.gladys);
  const last = (id) => world.fake.lastState(id);
  assert.equal(last(grid.feature('carbon_intensity')), 23);
  assert.equal(last(grid.feature('consumption')), 47_612_000);
  assert.equal(last(grid.feature('nuclear_share')), 65);
  assert.equal(last(grid.feature('solar_share')), 12);
  assert.equal(last(grid.feature('coal_share')), 0);
  assert.equal(last(grid.feature('exchanges_share')), -21);
  assert.equal(last(grid.feature('renewable_share')), 30);
  assert.equal(last(grid.feature('low_carbon_share')), 95);
  // 15:20 in Paris on the 14th: green today, orange tomorrow, green hour.
  assert.equal(last(ecowatt.feature('today')), 1);
  assert.equal(last(ecowatt.feature('tomorrow')), 2);
  assert.equal(last(ecowatt.feature('current_hour')), 1);
  assert.ok(world.fake.widgetRefreshes.length > 0, 'the widget is told');
});

test('a mix older than three hours is not published', async (t) => {
  const world = await createWorld({ config: { language: 'fr' } });
  t.after(() => world.app.stop());
  world.clock.advance(3 * 60 * 60 * 1000);
  world.rte.eco2mix = () => new Response('{}', { status: 503 });
  await createAll(world);
  assert.equal(world.fake.lastState(gridId(world.gladys).feature('carbon_intensity')), undefined);
});

test('the container refreshes by itself, without any onPoll from the core (Gladys#3198)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const world = await createWorld({ timers: true, clock: { now: () => Date.now() } });
  t.after(() => world.app.stop());
  await createAll(world);
  const { rte } = world;
  assert.equal(rte.count('eco2mix'), 1);
  assert.equal(rte.count('signals'), 1);

  const minutes = async (count) => {
    for (let i = 0; i < count; i += 1) {
      t.mock.timers.tick(TICK_MS);
      await settle();
    }
  };
  // RTE now announces an orange hour at 16:00 (read at 15:50).
  rte.signals = withSignals((signals) => {
    signals[0].values[16].hvalue = 2;
  });
  await minutes(14);
  assert.equal(rte.count('eco2mix'), 1, 'not before 15 minutes');
  await minutes(1);
  assert.equal(rte.count('eco2mix'), 2, 'every 15 minutes');
  await minutes(15);
  assert.equal(rte.count('eco2mix'), 3);
  assert.equal(rte.count('signals'), 2, 'EcoWatt every 30 minutes');
  assert.equal(world.fake.requests.filter((r) => r.path.includes('poll')).length, 0);

  // 15:59, then 16:00 in Paris: the current hour moves on the hour, from the
  // signals already read.
  const hour = ecowattId(world.gladys).feature('current_hour');
  await minutes(9);
  assert.equal(world.fake.lastState(hour), 1);
  await minutes(1);
  assert.equal(world.fake.lastState(hour), 2);
  assert.equal(rte.count('signals'), 2, 'without calling RTE');
});

test("the core's onPoll is a fallback: it reads nothing while the timer ticks", async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const [grid] = world.fake.discoveredDevices;
  const reads = () => world.rte.calls.length;
  const before = reads();

  world.clock.advance(30 * 1000);
  assert.deepEqual(await world.fake.poll(grid), { success: true });
  assert.equal(reads(), before, 'the timer ticked 30 s ago: nothing to do');

  // The timer stalls (no timers in this world): every core poll ticks, and
  // RTE is read at the pace of the data only.
  world.clock.advance(MIX_PERIOD_MS);
  assert.deepEqual(await world.fake.poll(grid), { success: true });
  assert.equal(world.rte.count('eco2mix'), 2);
  world.clock.advance(TICK_MS);
  await world.fake.poll(grid);
  assert.equal(world.rte.count('eco2mix'), 2);
});

test('only the values that changed are published, every value again after 6 hours', async (t) => {
  // The SDK dates its heartbeat with Date.now(): the world's clock follows it.
  t.mock.timers.enable({ apis: ['Date'], now: START });
  const clock = {
    now: () => Date.now(),
    advance: (ms) => t.mock.timers.tick(ms),
  };
  const world = await createWorld({ clock });
  t.after(() => world.app.stop());
  await createAll(world);
  const first = world.fake.states.length;
  assert.equal(first, 15);

  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.states.length, first, 'same quarter-hour: nothing sent');

  // A new quarter-hour where only the CO₂ moved.
  const mixBody = JSON.parse(await (await world.rte.eco2mix()).text());
  const row = mixBody.results.find((r) => r.taux_co2 !== null);
  row.taux_co2 = 31;
  row.date_heure = '2026-10-14T12:30:00+00:00';
  world.rte.eco2mix = () => new Response(JSON.stringify(mixBody), { status: 200 });
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.states.length, first + 1);
  assert.equal(world.fake.lastState(gridId(world.gladys).feature('carbon_intensity')), 31);

  // The EcoWatt levels never moved: sent again by the heartbeat. (The mix is
  // stale by then: it is not.)
  const ecowatt = ecowattId(world.gladys);
  const today = () =>
    world.fake.states.filter((s) => s.device_feature_external_id === ecowatt.feature('today'));
  assert.equal(today().length, 1);
  world.clock.advance(HEARTBEAT_MS);
  await world.app.tick();
  assert.equal(today().length, 2);
});

test('an orange day is announced once, also across a restart, and again when it turns red', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const events = () => world.fake.sceneEvents.filter((e) => e.key === TRIGGER_KEY);
  assert.equal(events().length, 1);
  assert.deepEqual(events()[0].data, {
    color: 'orange',
    level: 2,
    date: '2026-10-15',
    days_ahead: 1,
    message: "Risque de coupures d'électricité, réduisons notre consommation.",
  });

  world.clock.advance(ECOWATT_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.rte.count('signals'), 2);
  assert.equal(events().length, 1, 'the same announcement is not repeated');
  await world.app.stop();

  // A restart: /data remembers the announcement and the quota.
  const restarted = await createWorld({ dataDir: world.dataDir, clock: world.clock });
  t.after(() => restarted.app.stop());
  assert.equal(restarted.rte.count('signals'), 0, 'called 0 min ago: the quota waits');
  assert.equal(restarted.fake.sceneEvents.length, 0);
  restarted.clock.advance(ECOWATT_PERIOD_MS);
  await restarted.app.tick();
  assert.equal(restarted.rte.count('signals'), 1);
  assert.equal(restarted.fake.sceneEvents.length, 0, 'already announced before the restart');

  // RTE raises the 15th to red, and announces the 17th orange.
  restarted.rte.signals = withSignals((signals) => {
    signals[1].dvalue = 3;
    signals[3].dvalue = 2;
  });
  restarted.clock.advance(ECOWATT_PERIOD_MS);
  await restarted.app.tick();
  assert.deepEqual(
    restarted.fake.sceneEvents.map((e) => [e.data.date, e.data.color, e.data.days_ahead]),
    [
      ['2026-10-15', 'red', 1],
      ['2026-10-17', 'orange', 3],
    ],
  );
});

test('an announcement Gladys refused is sent again after the next reading', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let refuse = true;
  t.mock.method(world.gladys, 'publishSceneEvent', async (...args) => {
    if (refuse) {
      throw new Error('HTTP 429');
    }
    return publish(...args);
  });
  await world.gladys.connect();
  assert.equal(world.fake.sceneEvents.length, 0);
  refuse = false;
  world.clock.advance(ECOWATT_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.sceneEvents.length, 1);
});

test('refused EcoWatt credentials say so in the configuration screen, then recover', async (t) => {
  const world = await createWorld({
    config: { language: 'fr', ecowatt_client_id: CLIENT_ID, ecowatt_client_secret: 'wrong' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /EcoWatt refuse/);
  assert.equal(world.rte.count('signals'), 0);

  await world.fake.configUpdated({
    language: 'fr',
    ecowatt_client_id: CLIENT_ID,
    ecowatt_client_secret: CLIENT_SECRET,
  });
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.rte.count('signals'), 1);
});

test('éCO2mix down: the status says so once, the figures come back on their own', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.rte.eco2mix = () => new Response('{}', { status: 502 });
  await world.gladys.connect();
  await createAll(world);
  assert.equal(world.fake.connectionStatus.connected, false);
  const statuses = world.fake.connectionStatuses.length;
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.connectionStatuses.length, statuses, 'not sent again');

  world.rte.eco2mix = createFakeRte().eco2mix;
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the action tests éCO2mix and the key, without breaking the quota', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  const { message } = ack.data;
  // The time follows the TZ of Gladys (UTC in the CI).
  assert.match(
    message.fr,
    /^éCO2mix : 23 g de CO₂\/kWh à \d\d:15\. EcoWatt : clé acceptée \(signaux relus dans 15 min/,
  );
  assert.match(message.de, /Schlüssel akzeptiert/);
  assert.equal(world.rte.count('signals'), 1, 'the startup read was just now: no second call');

  world.clock.advance(ECOWATT_PERIOD_MS);
  const later = await world.fake.action('test_connection', {});
  assert.match(later.data.message.en, /EcoWatt: key accepted, signal of the day: Green\./);
  assert.equal(world.rte.count('signals'), 2);

  const keyless = await createWorld({ config: { language: 'es' } });
  t.after(() => keyless.app.stop());
  const noKey = await keyless.fake.action('test_connection', {});
  assert.match(noKey.data.message.es, /no se ha indicado ninguna clave/);
});
