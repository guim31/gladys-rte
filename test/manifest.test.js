// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEY, ALERT_COLORS, GAS_TRIGGER_KEY, TRIGGER_KEY } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/widgets.js';
import {
  ECOGAZ_BODY,
  GAS_START,
  createClock,
  createFakeRte,
  createWorld,
} from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cover, cloud transport, energy category', () => {
  assert.equal(manifest.name, 'RTE éCO2mix, EcoWatt & EcoGaz');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-rte:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-rte/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['energy']);
  // The two APIs are on the internet: no LAN discovery, no Wake-on-LAN.
  assert.equal(manifest.network_discovery, undefined);
  assert.equal(manifest.network_wake, undefined);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION));
});

test('two scene triggers and a widget, no scene action: Gladys >= 5.1.0', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGER_KEY, GAS_TRIGGER_KEY]);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.equal(manifest.scene_actions, undefined);
  assert.ok(isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION));
  // No widget button opens a form (#3168): 5.2.0 is not needed.
  assert.equal(manifest.gladys_version, '>=5.1.0');
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const valued = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(keysOf(valued).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of valued) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.deepEqual(
    language.options.map((option) => option.value),
    LANGUAGES,
  );
  assert.equal(language.default, 'fr');
});

test('the client secret is a secret field, and the EcoWatt key is optional', () => {
  const field = (key) => manifest.config_schema.find((f) => f.key === key);
  assert.equal(field('ecowatt_client_secret').type, 'secret');
  assert.equal(field('ecowatt_client_secret').required, false);
  assert.equal(field('ecowatt_client_id').required, false);
});

test('section fields are purely presentational, their links https', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('the configuration says the integration is not affiliated with RTE', () => {
  const intro = manifest.config_schema.find((field) => field.key === 'intro');
  assert.match(intro.description.en, /Not affiliated with RTE/);
  assert.match(intro.description.fr, /Sans lien avec RTE/);
});

test('every manifest action has a handler, and needs no field', async (t) => {
  assert.deepEqual(keysOf(manifest.actions), [ACTION_KEY]);
  // An action applies no `default` and cannot fill a secret (Gladys#3154, #3155).
  assert.equal(manifest.actions[0].fields, undefined);
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true, ack.error);
});

test('the trigger filters and variables are the keys the code sends', async (t) => {
  const [trigger] = manifest.scene_triggers;
  const colors = trigger.fields.find((f) => f.key === 'color');
  assert.deepEqual(
    colors.options.map((o) => o.value),
    Object.values(ALERT_COLORS),
  );
  const days = trigger.fields.find((f) => f.key === 'days_ahead');
  assert.deepEqual(
    days.options.map((o) => o.value),
    ['0', '1', '2', '3'],
  );

  const world = await createWorld();
  t.after(() => world.app.stop());
  const [event] = world.fake.sceneEvents;
  assert.equal(event.key, TRIGGER_KEY);
  // Every key sent is declared (a filter or a variable), every variable sent.
  const declared = new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)]);
  assert.deepEqual(
    Object.keys(event.data).filter((key) => !declared.has(key)),
    [],
  );
  assert.deepEqual(Object.keys(event.data).sort(), keysOf(trigger.variables).sort());
  for (const variable of trigger.variables) {
    assert.equal(typeof event.data[variable.key], variable.type, variable.key);
  }
});

test('the EcoGaz trigger filters and variables are the keys the code sends', async (t) => {
  const trigger = manifest.scene_triggers.find((tr) => tr.key === GAS_TRIGGER_KEY);
  assert.deepEqual(
    trigger.fields.find((f) => f.key === 'color').options.map((o) => o.value),
    ['orange', 'red'],
  );
  assert.deepEqual(
    trigger.fields.find((f) => f.key === 'days_ahead').options.map((o) => o.value),
    ['0', '1'],
  );
  const rte = createFakeRte();
  const body = structuredClone(ECOGAZ_BODY);
  body.results.find((row) => row.gas_day === '2026-10-29').indice_de_couleur = '4';
  rte.ecogaz = () => new Response(JSON.stringify(body), { status: 200 });
  const world = await createWorld({ rte, clock: createClock(GAS_START) });
  t.after(() => world.app.stop());
  const event = world.fake.sceneEvents.find((e) => e.key === GAS_TRIGGER_KEY);
  assert.deepEqual(Object.keys(event.data).sort(), keysOf(trigger.variables).sort());
  for (const variable of trigger.variables) {
    assert.equal(typeof event.data[variable.key], variable.type, variable.key);
  }
  // The filters compare strings: the core converts the number of the event.
  assert.ok(['0', '1'].includes(String(event.data.days_ahead)));
  assert.ok(['orange', 'red'].includes(event.data.color));
});
