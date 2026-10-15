// -----------------------------------------------------------------------------
// The "French power grid" widget: a content the core renders exactly as sent
// (validateWidgetContent), within its budget, in the four languages, bound to
// features that exist.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY, bar, buildWidgetContent, co2Color } from '../src/widgets.js';
import { latestMix } from '../src/eco2mix.js';
import { ECO2MIX_BODY, createAll, createWorld } from './helpers/world.js';

const get = (world, language = 'fr') =>
  world.fake.widgetGet(WIDGET_KEY, { settings: {}, language, units: 'metric' });

test('the widget shows the CO₂, the consumption, EcoWatt and the mix as bars', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await get(world);
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);

  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((c) => [c.label, c.value, c.unit ?? null, c.color ?? null]),
    [
      ['CO₂', 23, 'g/kWh', 'success'],
      ['Consommation', 47.6, 'GW', null],
      ['Bas carbone', 95, '%', null],
      ["EcoWatt aujourd'hui", 'Vert', null, 'success'],
      ['EcoWatt demain', 'Orange', null, 'warning'],
    ],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => `${item.label} ${item.value}`),
    [
      'Nucléaire ███████░░░ 65 %',
      'Solaire █░░░░░░░░░ 12 %',
      'Hydraulique █░░░░░░░░░ 8,7 %',
      'Éolien █░░░░░░░░░ 7,5 %',
      'Gaz █░░░░░░░░░ 5,3 %',
      'Bioénergies ░░░░░░░░░░ 1,7 %',
      'Exportations ██░░░░░░░░ 21 %',
    ],
  );
  assert.equal(content.components.at(-1).variant, 'caption');
  assert.match(content.components.at(-1).text, /^RTE éCO2mix · \d\d:15$/);
  assert.equal(content.components.filter((c) => c.type === 'chart').length, 0, 'no device yet');
});

test('once the grid device exists, the widget draws its 24-hour CO₂ curve', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world);
  const content = (await get(world, 'de')).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const chart = content.components.find((c) => c.type === 'chart');
  const co2 = world.fake.discoveredDevices[0].features.find((f) => f.type === 'carbon-intensity');
  assert.deepEqual(chart.device_features, [co2.external_id]);
  assert.equal(chart.chart_type, 'bar');
  assert.equal(chart.title, 'CO₂ über 24 h');
});

test('every language renders, and the core budget is kept', () => {
  const mix = latestMix(ECO2MIX_BODY);
  for (const language of ['en', 'fr', 'de', 'es']) {
    const content = buildWidgetContent({
      mix,
      ecowatt: { today: 3, tomorrow: 2 },
      co2Feature: 'ext:rte:grid:france:carbon_intensity',
      failing: false,
      language,
      timeZone: 'Europe/Paris',
    });
    assert.deepEqual(validateWidgetContent(content), [], language);
    assert.ok(content.components.length <= 8);
    assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
    assert.match(content.components.at(-1).text, /14:15/);
  }
});

test('without figures, the widget says it waits, or that éCO2mix is down', async (t) => {
  const waiting = buildWidgetContent({
    mix: null,
    ecowatt: null,
    co2Feature: null,
    failing: false,
    language: 'es',
  });
  assert.deepEqual(validateWidgetContent(waiting), []);
  assert.match(waiting.components[0].text, /A la espera/);

  const world = await createWorld({ connect: false, config: { language: 'en' } });
  t.after(() => world.app.stop());
  world.rte.eco2mix = () => new Response('{}', { status: 500 });
  await world.gladys.connect();
  const data = (await get(world, 'en')).data.content;
  assert.deepEqual(validateWidgetContent(data), []);
  assert.deepEqual(
    data.components.map((c) => c.type),
    ['text'],
  );
  assert.match(data.components[0].text, /cannot be reached/);
});

test('the colors follow the Gladys thresholds, the bars the shares', () => {
  assert.equal(co2Color(40), 'success');
  assert.equal(co2Color(150), 'warning');
  assert.equal(co2Color(400), 'danger');
  assert.equal(bar(0), '░░░░░░░░░░');
  assert.equal(bar(64), '██████░░░░');
  assert.equal(bar(100), '██████████');
  assert.equal(bar(-21), '██░░░░░░░░');
});
