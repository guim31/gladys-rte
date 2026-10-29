// -----------------------------------------------------------------------------
// éCO2mix by region and EcoGaz: the two clients on real ODRÉ answers, then the
// integration on the SDK's fake Gladys (devices, states, the "EcoGaz alert
// announced" trigger, the configuration action).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_KEY, ECOGAZ_PERIOD_MS, GAS_TRIGGER_KEY, MIX_PERIOD_MS } from '../src/app.js';
import { normalizeConfig } from '../src/config.js';
import { ECOGAZ_URL, gasLevelsAt, parseEcogaz } from '../src/ecogaz.js';
import {
  REGIONAL_URL,
  fetchRegionalMixes,
  latestRegionalMixes,
  regionalQuery,
} from '../src/regional.js';
import {
  ECOGAZ_BODY,
  GAS_START,
  REGIONAL_AT,
  REGIONAL_BODY,
  createClock,
  createFakeRte,
  createWorld,
  ecogazId,
  regionId,
} from './helpers/world.js';

const CODES = ['11', '24', '76'];

const json = (body) => () => new Response(JSON.stringify(body), { status: 200 });

/** The EcoGaz fixture with some days recolored: `{ 'YYYY-MM-DD': index 1-4 }`. */
function gasWith(colors) {
  const body = structuredClone(ECOGAZ_BODY);
  for (const row of body.results) {
    if (colors[row.gas_day]) {
      row.indice_de_couleur = String(colors[row.gas_day]);
    }
  }
  return json(body);
}

async function regionalWorld(options = {}) {
  return createWorld({
    clock: createClock(GAS_START),
    config: { language: 'fr', regions: CODES },
    ...options,
  });
}

// --- The clients ---------------------------------------------------------------

test('regional: asks ODRÉ for the rows of the chosen regions that carry a consumption', async () => {
  const urls = [];
  await fetchRegionalMixes(async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify(REGIONAL_BODY), { status: 200 });
  }, CODES);
  const url = new URL(urls[0]);
  assert.equal(`${url.origin}${url.pathname}`, REGIONAL_URL);
  assert.equal(
    url.searchParams.get('where'),
    'code_insee_region in ("11", "24", "76") and consommation is not null',
  );
  assert.equal(url.searchParams.get('order_by'), 'date_heure desc');
  assert.equal(url.searchParams.get('limit'), '24');
  assert.equal(url.search.slice(1), regionalQuery(CODES));
  // Every region at most: the API returns 100 rows at most.
  assert.equal(new URLSearchParams(regionalQuery(Array(20).fill('11'))).get('limit'), '100');
  assert.deepEqual(await fetchRegionalMixes(async () => assert.fail('no call'), []), {});
});

test('regional: the newest complete quarter-hour of each region, from a real answer', () => {
  const mixes = latestRegionalMixes(REGIONAL_BODY, CODES);
  assert.deepEqual(Object.keys(mixes).sort(), CODES);
  for (const mix of Object.values(mixes)) {
    assert.equal(mix.at, REGIONAL_AT);
  }
  // Centre-Val de Loire at 00:45: four nuclear plants, a big exporter.
  const centre = mixes['24'];
  assert.equal(centre.consumptionMw, 2025);
  assert.equal(centre.productionMw, 8354 + 24 + 275 + 0 + 30 + 0);
  assert.equal(centre.exchangesMw, -6657);
  assert.ok(centre.coveragePercent > 400);
  assert.ok(centre.sharesPercent.nuclear > 95);
  const total = Object.values(centre.sharesPercent).reduce((sum, v) => sum + v, 0);
  assert.ok(Math.abs(total - 100) < 0.5, `shares add up to ${total}`);
  // Île-de-France imports almost everything.
  assert.ok(mixes['11'].exchangesMw > 0);
  assert.ok(mixes['11'].coveragePercent < 10);
});

test('regional: skips a quarter-hour not filled in yet, and a region not asked for', () => {
  const body = structuredClone(REGIONAL_BODY);
  const newer = {
    ...body.results.find((r) => r.code_insee_region === '76'),
    date_heure: '2026-10-29T00:00:00+00:00',
    nucleaire: null,
    eolien: null,
  };
  body.results.unshift(newer);
  const mixes = latestRegionalMixes(body, ['76']);
  assert.deepEqual(Object.keys(mixes), ['76']);
  assert.equal(mixes['76'].at, REGIONAL_AT);
  assert.throws(() => latestRegionalMixes({}, CODES), /without a list/);
});

test('the regions of the configuration: known codes only, without duplicates', () => {
  assert.deepEqual(normalizeConfig({}).regions, []);
  assert.deepEqual(normalizeConfig({ regions: ['76', '11', '76', '20', 'x'] }).regions, [
    '11',
    '76',
  ]);
  assert.deepEqual(normalizeConfig({ regions: ' 24, 93 ' }).regions, ['24', '93']);
});

test('EcoGaz: a real answer, GRTgaz colors 1-4 published as 0-3, Paris dates', () => {
  const signals = parseEcogaz(ECOGAZ_BODY);
  assert.equal(signals.days[0].date, '2026-10-26');
  assert.ok(signals.days.every((d) => d.level === 0));
  assert.deepEqual(gasLevelsAt(signals, GAS_START), [0, 0, 0, 0]);
  const colored = parseEcogaz({
    results: [
      { gas_day: '2026-10-30', indice_de_couleur: '4' },
      { gas_day: '2026-10-29', indice_de_couleur: 2 },
      { gas_day: '2026-10-31', indice_de_couleur: 'ND' },
    ],
  });
  assert.deepEqual(gasLevelsAt(colored, GAS_START), [1, 3, null, null]);
  // 23:30 in Paris on the 28th is still the 28th.
  assert.deepEqual(gasLevelsAt(colored, Date.UTC(2026, 9, 28, 22, 30)), [null, 1, 3, null]);
  assert.throws(() => parseEcogaz({ results: [] }), /no signal/);
  assert.ok(ECOGAZ_URL.includes('signal-ecogaz'));
});

// --- The integration ------------------------------------------------------------

test('one device per chosen region, read once at start, its states once added', async (t) => {
  const world = await regionalWorld();
  t.after(() => world.app.stop());
  const names = world.fake.discoveredDevices.map((d) => d.name);
  assert.deepEqual(names, [
    'Réseau électrique français',
    'EcoGaz',
    'Électricité Île-de-France',
    'Électricité Centre-Val de Loire',
    'Électricité Occitanie',
  ]);
  assert.equal(world.rte.count('regional'), 1);
  assert.equal(world.rte.count('ecogaz'), 1);

  const centre = world.fake.discoveredDevices.find((d) => d.name.endsWith('Loire'));
  await world.fake.deviceCreated(centre);
  const id = regionId(world.gladys, '24');
  const last = (key) => world.fake.lastState(id.feature(key));
  assert.equal(last('consumption'), 2_025_000);
  assert.equal(last('production'), 8_683_000);
  assert.equal(last('exchanges'), -6_657_000);
  assert.equal(last('coverage'), 429);
  assert.equal(last('nuclear_share'), 96);
  assert.equal(last('thermal_share'), 0);
  assert.equal(last('low_carbon_share'), 100);
  // Only the region added receives states.
  assert.equal(
    world.fake.lastState(regionId(world.gladys, '11').feature('consumption')),
    undefined,
  );
});

test('regions are read every 15 minutes only while one of their devices is added', async (t) => {
  const world = await regionalWorld();
  t.after(() => world.app.stop());
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.rte.count('regional'), 1, 'no region device yet');

  await world.fake.deviceCreated(
    world.fake.discoveredDevices.find((d) => d.name.endsWith('Occitanie')),
  );
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.rte.count('regional'), 2);
});

test('without a region, éCO2mix regional is never called', async (t) => {
  const world = await createWorld({ clock: createClock(GAS_START) });
  t.after(() => world.app.stop());
  world.clock.advance(MIX_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.rte.count('regional'), 0);
});

test('the EcoGaz device receives today and the next three days, read every hour', async (t) => {
  const rte = createFakeRte();
  rte.ecogaz = gasWith({ '2026-10-30': 2, '2026-11-01': 3 });
  const world = await regionalWorld({ rte });
  t.after(() => world.app.stop());
  await world.fake.deviceCreated(world.fake.discoveredDevices.find((d) => d.name === 'EcoGaz'));
  const id = ecogazId(world.gladys);
  assert.equal(world.fake.lastState(id.feature('today')), 0);
  assert.equal(world.fake.lastState(id.feature('tomorrow')), 1);
  assert.equal(world.fake.lastState(id.feature('day_2')), 0);
  assert.equal(world.fake.lastState(id.feature('day_3')), 2);

  world.clock.advance(ECOGAZ_PERIOD_MS - 60_000);
  await world.app.tick();
  assert.equal(world.rte.count('ecogaz'), 1);
  world.clock.advance(60_000);
  await world.app.tick();
  assert.equal(world.rte.count('ecogaz'), 2);
});

test('EcoGaz alert: today or tomorrow orange or red, once per day and level', async (t) => {
  const rte = createFakeRte();
  // Today yellow, tomorrow orange, in two days red (not watched).
  rte.ecogaz = gasWith({ '2026-10-29': 2, '2026-10-30': 3, '2026-10-31': 4 });
  const world = await regionalWorld({ rte });
  t.after(() => world.app.stop());
  const events = () => world.fake.sceneEvents.filter((e) => e.key === GAS_TRIGGER_KEY);
  assert.deepEqual(
    events().map((e) => e.data),
    [{ color: 'orange', level: 2, date: '2026-10-30', days_ahead: 1 }],
  );

  // Read again: nothing new. Tomorrow turns red: announced again.
  world.clock.advance(ECOGAZ_PERIOD_MS);
  await world.app.tick();
  assert.equal(events().length, 1);
  rte.ecogaz = gasWith({ '2026-10-30': 4 });
  world.clock.advance(ECOGAZ_PERIOD_MS);
  await world.app.tick();
  assert.deepEqual(events()[1].data, { color: 'red', level: 3, date: '2026-10-30', days_ahead: 1 });

  // A restart remembers what was announced (/data).
  await world.app.stop();
  const again = await regionalWorld({ rte, dataDir: world.dataDir });
  t.after(() => again.app.stop());
  assert.equal(again.fake.sceneEvents.filter((e) => e.key === GAS_TRIGGER_KEY).length, 0);
});

test('an EcoGaz alert refused by Gladys is announced again at the next reading', async (t) => {
  const rte = createFakeRte();
  rte.ecogaz = gasWith({ '2026-10-29': 3 });
  const world = await regionalWorld({ rte, connect: false });
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let refuse = true;
  world.gladys.publishSceneEvent = async (key, data) => {
    if (refuse && key === GAS_TRIGGER_KEY) {
      throw new Error('HTTP 500');
    }
    return publish(key, data);
  };
  await world.gladys.connect();
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === GAS_TRIGGER_KEY).length, 0);
  refuse = false;
  world.clock.advance(ECOGAZ_PERIOD_MS);
  await world.app.tick();
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === GAS_TRIGGER_KEY).length, 1);
});

test('the test action reports EcoGaz and the regions', async (t) => {
  const world = await regionalWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true, ack.error);
  const text = JSON.stringify(ack);
  assert.match(text, /EcoGaz : signal du jour : Vert/);
  assert.match(text, /3 région\(s\) lue\(s\) sur 3/);
});

test('an EcoGaz reading from the action beside a tick announces a day once', async (t) => {
  const rte = createFakeRte();
  const world = await regionalWorld({ rte });
  t.after(() => world.app.stop());
  rte.ecogaz = gasWith({ '2026-10-29': 4 });
  // Gladys takes its time to accept the event: the two readings overlap.
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (key, data) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return publish(key, data);
  };
  world.clock.advance(ECOGAZ_PERIOD_MS);
  await Promise.all([world.app.tick(), world.fake.action(ACTION_KEY, {})]);
  assert.equal(world.rte.count('ecogaz'), 3, 'both read EcoGaz');
  assert.equal(world.fake.sceneEvents.filter((e) => e.key === GAS_TRIGGER_KEY).length, 1);
});
