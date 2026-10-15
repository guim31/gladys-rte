// -----------------------------------------------------------------------------
// The éCO2mix client: the request, and the reading of an ODRÉ answer (the
// newest complete quarter-hour, the shares of the mix).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECO2MIX_URL,
  eco2mixQuery,
  fetchLatestMix,
  latestMix,
  parseMixRecord,
} from '../src/eco2mix.js';
import { ECO2MIX_BODY, MIX_AT } from './helpers/world.js';

test('asks ODRÉ for the newest rows that carry a CO₂ value', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify(ECO2MIX_BODY), { status: 200 });
  };
  await fetchLatestMix(fetchImpl);
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(`${url.origin}${url.pathname}`, ECO2MIX_URL);
  assert.equal(url.searchParams.get('where'), 'taux_co2 is not null');
  assert.equal(url.searchParams.get('order_by'), 'date_heure desc');
  assert.equal(url.search.slice(1), eco2mixQuery());
});

test('keeps the newest complete quarter-hour, skipping the rows not filled in yet', () => {
  const mix = latestMix(ECO2MIX_BODY);
  assert.equal(mix.at, MIX_AT);
  assert.equal(mix.co2, 23);
  assert.equal(mix.consumptionMw, 47612);
  assert.equal(mix.exchangesMw, -10164);
});

test('computes the shares of the production, and the exchanges of the consumption', () => {
  const mix = latestMix(ECO2MIX_BODY);
  // 79 + 0 + 3121 + 38407 + 4410 + 6930 + 5122 + 1012 MW
  assert.equal(mix.productionMw, 59081);
  assert.equal(mix.sharesPercent.nuclear, 65);
  assert.equal(mix.sharesPercent.solar, 11.7);
  assert.equal(mix.sharesPercent.wind, 7.5);
  assert.equal(mix.sharesPercent.hydro, 8.7);
  assert.equal(mix.sharesPercent.gas, 5.3);
  assert.equal(mix.sharesPercent.coal, 0);
  assert.equal(mix.sharesPercent.bioenergy, 1.7);
  const total = Object.values(mix.sharesPercent).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 100) < 0.5, `the shares add up to ${total}`);
  // France exports: negative.
  assert.equal(mix.exchangesPercent, -21.3);
  assert.equal(mix.renewablePercent, 29.6);
  assert.equal(mix.lowCarbonPercent, 94.6);
});

test('reads numbers sent as strings, and refuses the "not available" ones', () => {
  const [row] = ECO2MIX_BODY.results.filter((r) => r.taux_co2 !== null);
  assert.equal(parseMixRecord({ ...row, nucleaire: '38407', taux_co2: '23' })?.co2, 23);
  assert.equal(parseMixRecord({ ...row, nucleaire: 'ND' }), null);
  assert.equal(parseMixRecord({ ...row, consommation: null }), null);
  assert.equal(parseMixRecord({ ...row, date_heure: 'yesterday' }), null);
  assert.equal(parseMixRecord(null), null);
  // A negative production (a measure glitch) never makes a negative share.
  assert.equal(parseMixRecord({ ...row, charbon: -3 }).sharesPercent.coal, 0);
});

test('an answer without a complete row, or not shaped like ODRÉ, is an error', () => {
  assert.throws(() => latestMix({ results: [] }), /no complete quarter-hour/);
  assert.throws(() => latestMix({ error_code: 'ODSQLError' }), /without a list/);
  assert.throws(() => latestMix(null), /without a list/);
});

test('an HTTP error or a network failure says which, never more', async () => {
  await assert.rejects(
    fetchLatestMix(async () => new Response('busy', { status: 503 })),
    /éCO2mix answered HTTP 503/,
  );
  await assert.rejects(
    fetchLatestMix(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }),
    /éCO2mix unreachable \(ECONNREFUSED\)/,
  );
  await assert.rejects(
    fetchLatestMix(async () => new Response('<html>', { status: 200 })),
    /not JSON/,
  );
});
