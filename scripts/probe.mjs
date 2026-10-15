#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real RTE APIs with the integration's own clients, read-only,
// from a machine that has the network (the development session had none).
//
//   node scripts/probe.mjs                 éCO2mix, then EcoWatt with a fake
//                                          application (must be refused)
//   RTE_CLIENT_ID=… RTE_CLIENT_SECRET=… node scripts/probe.mjs
//                                          also reads the real EcoWatt signals
//                                          (ONE call: the quota is one every
//                                          15 minutes)
//   node scripts/probe.mjs --save DIR      also writes the raw answers to DIR,
//                                          to refresh test/fixtures
//
// Prints figures and shapes only: never a credential, a token or a header.
// Exits 1 when something does not match what the integration expects.
// -----------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ECO2MIX_URL, eco2mixQuery, latestMix } from '../src/eco2mix.js';
import {
  CredentialsError,
  SIGNALS_URL,
  TOKEN_URL,
  createEcowattClient,
  levelsAt,
} from '../src/ecowatt.js';

const saveIndex = process.argv.indexOf('--save');
const saveDir = saveIndex > 0 ? process.argv[saveIndex + 1] : null;
let failures = 0;

const ok = (message) => console.log(`  ok   ${message}`);
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL ${message}`);
};

/** fetch that keeps a copy of the JSON bodies, for --save. */
const bodies = {};
async function recordingFetch(url, init) {
  const response = await fetch(url, init);
  const text = await response.clone().text();
  const name = String(url).startsWith(ECO2MIX_URL)
    ? 'eco2mix-national-tr.json'
    : String(url) === SIGNALS_URL
      ? 'ecowatt-signals.json'
      : null;
  if (name && response.ok) {
    bodies[name] = text;
  }
  return response;
}

async function probeEco2mix() {
  console.log(`éCO2mix — ${ECO2MIX_URL}`);
  const response = await fetch(`${ECO2MIX_URL}?${eco2mixQuery()}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    fail(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return;
  }
  const body = await response.json();
  bodies['eco2mix-national-tr.json'] = JSON.stringify(body, null, 2);
  ok(`HTTP 200, ${body.results?.length} rows (total_count ${body.total_count})`);
  const [first] = body.results ?? [];
  console.log(`       fields of a row: ${Object.keys(first ?? {}).join(', ')}`);
  try {
    const mix = latestMix(body);
    const ageMin = Math.round((Date.now() - Date.parse(mix.at)) / 60000);
    ok(`latest complete quarter-hour ${mix.at} (${ageMin} min ago)`);
    ok(
      `CO₂ ${mix.co2} g/kWh, consumption ${mix.consumptionMw} MW, production ${mix.productionMw} MW, ` +
        `exchanges ${mix.exchangesMw} MW (${mix.exchangesPercent} %)`,
    );
    ok(`shares ${JSON.stringify(mix.sharesPercent)}`);
    ok(`renewable ${mix.renewablePercent} %, low-carbon ${mix.lowCarbonPercent} %`);
    if (ageMin > 180) {
      fail(
        'the latest complete row is more than 3 hours old: the integration would publish nothing',
      );
    }
  } catch (err) {
    fail(err.message);
  }
}

async function probeEcowatt() {
  console.log(`EcoWatt — ${TOKEN_URL}, ${SIGNALS_URL}`);
  const quota = {};
  const client = createEcowattClient({
    fetch: recordingFetch,
    loadQuota: () => quota,
    saveQuota: (next) => Object.assign(quota, next),
  });

  // A fake application: RTE must refuse it with a 400/401 on the token.
  try {
    await client.checkCredentials({
      ecowatt_client_id: 'gladys-probe-not-a-client',
      ecowatt_client_secret: 'not-a-secret',
    });
    fail('a fake application was given a token');
  } catch (err) {
    if (err instanceof CredentialsError) {
      ok(`a fake application is refused (HTTP ${err.status})`);
    } else {
      fail(`a fake application: unexpected error ${err.message}`);
    }
  }

  const id = process.env.RTE_CLIENT_ID;
  const secret = process.env.RTE_CLIENT_SECRET;
  if (!id || !secret) {
    console.log('       RTE_CLIENT_ID / RTE_CLIENT_SECRET not set: real signals not read');
    return;
  }
  const config = { ecowatt_client_id: id, ecowatt_client_secret: secret };
  client.reset();
  try {
    await client.checkCredentials(config);
    ok('the real application gets a token');
    const signals = await client.fetchSignals(config);
    ok(`signals generated at ${signals.generatedAt}`);
    for (const day of signals.days) {
      ok(
        `${day.date}: level ${day.level}, ${Object.keys(day.hours).length} hours, "${day.message}"`,
      );
    }
    ok(`now: ${JSON.stringify(levelsAt(signals, Date.now()))}`);
  } catch (err) {
    fail(err.message);
  }
}

await probeEco2mix().catch((err) => fail(`éCO2mix: ${err.message}`));
await probeEcowatt().catch((err) => fail(`EcoWatt: ${err.message}`));

if (saveDir) {
  await mkdir(saveDir, { recursive: true });
  for (const [name, text] of Object.entries(bodies)) {
    await writeFile(join(saveDir, name), text);
    console.log(`saved ${join(saveDir, name)}`);
  }
}
console.log(failures === 0 ? 'PROBE OK' : `PROBE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
