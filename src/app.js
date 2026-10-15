// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests).
//
// Refresh (the core does not poll external devices reliably, Gladys#3198):
// the container ticks every minute on its own timer. A tick
//   - reads éCO2mix every 15 minutes (the pace of the data), when the grid
//     device is added or a dashboard showed the widget in the last hour;
//   - reads EcoWatt every 30 minutes when a key is given (the quota is one
//     call every 15 minutes: the client never calls sooner, src/ecowatt.js);
//   - publishes the states that changed (the EcoWatt hour moves on the hour),
//     each value sent again at least every 6 hours (heartbeat).
// The core's onPoll, called every minute for the devices it does poll, only
// runs a tick when the timer missed one: it is the fallback.
//
// The "EcoWatt alert announced" trigger fires once per announcement: a day
// turning orange, or red, for the first time (remembered under /data).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasEcowatt, normalizeConfig } from './config.js';
import {
  ECOWATT,
  GRID,
  MIX_MAX_AGE_MS,
  buildDevices,
  deviceIds,
  ecowattStates,
  gridStates,
} from './devices.js';
import { fetchLatestMix } from './eco2mix.js';
import {
  CredentialsError,
  LEVELS,
  QuotaError,
  createEcowattClient,
  levelsAt,
  parisTime,
} from './ecowatt.js';
import { MESSAGES, TEXT, joinTexts } from './i18n.js';
import { createIssueLog } from './issues.js';
import { Store } from './store.js';
import { WIDGET_KEY, buildWidgetContent } from './widgets.js';

const logger = createLogger({ name: 'rte' });

export const TICK_MS = 60 * 1000;
export const MIX_PERIOD_MS = 15 * 60 * 1000;
export const ECOWATT_PERIOD_MS = 30 * 60 * 1000;
export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
/** A widget shown in the last hour keeps éCO2mix read without the device. */
const WIDGET_INTEREST_MS = 60 * 60 * 1000;

export const TRIGGER_KEY = 'ecowatt_alert';
export const ACTION_KEY = 'test_connection';
export const ALERT_COLORS = { [LEVELS.ORANGE]: 'orange', [LEVELS.RED]: 'red' };

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {Store} [options.store]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the minute timer
 */
export function registerHandlers(
  gladys,
  {
    fetch: fetchImpl = globalThis.fetch,
    store = new Store(),
    now = () => Date.now(),
    timers = true,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  /** What /data keeps: `{ ecowatt: { lastCallAt, notBefore, signals }, announced: { date: level } }`. */
  let persisted = { ecowatt: {}, announced: {} };
  let mix = null;
  let mixAttemptAt = -Infinity;
  let ecowattAttemptAt = -Infinity;
  let widgetShownAt = -Infinity;
  let lastTickAt = -Infinity;
  let credentialsRefused = false;
  let lastStatus = null;
  let firstMix = true;
  let timer = null;
  let stopped = false;
  let ticking = null;

  const eco2mixIssues = createIssueLog(logger.child('eco2mix'));
  const ecowattIssues = createIssueLog(logger.child('ecowatt'));
  const gladysIssues = createIssueLog(logger);

  const client = createEcowattClient({
    fetch: fetchImpl,
    now,
    loadQuota: () => persisted.ecowatt,
    saveQuota: (quota) => {
      persisted.ecowatt = { ...persisted.ecowatt, ...quota };
      store.save(persisted);
    },
  });

  const ready = store.load().then((data) => {
    persisted = {
      ecowatt: data.ecowatt && typeof data.ecowatt === 'object' ? data.ecowatt : {},
      announced: data.announced && typeof data.announced === 'object' ? data.announced : {},
    };
  });

  const isCreated = (type) => {
    const id = deviceIds(gladys, type).device;
    return (gladys.devices ?? []).some((device) => device.external_id === id);
  };
  const signals = () => persisted.ecowatt.signals ?? null;
  const freshMix = () => (mix && now() - Date.parse(mix.at) <= MIX_MAX_AGE_MS ? mix : null);

  // --- Reading the two APIs -------------------------------------------------

  /** @param {{ nudge?: boolean }} [options] nudge: tell the widget (not from its own pull) */
  async function refreshMix({ nudge = true } = {}) {
    mixAttemptAt = now();
    try {
      const next = await fetchLatestMix(fetchImpl);
      const changed = next.at !== mix?.at;
      mix = next;
      if (firstMix) {
        firstMix = false;
        logger.info(`éCO2mix reachable: ${next.co2} g CO₂/kWh at ${next.at}`);
      }
      eco2mixIssues.ok('read', 'éCO2mix answers again');
      if (changed) {
        logger.debug(`éCO2mix ${next.at}: ${next.co2} g/kWh, ${next.consumptionMw} MW`);
        if (nudge) {
          gladys.requestWidgetRefresh(WIDGET_KEY);
        }
      }
      return true;
    } catch (err) {
      eco2mixIssues.fail('read', `éCO2mix cannot be read: ${err.message}`);
      return false;
    }
  }

  async function refreshEcowatt() {
    ecowattAttemptAt = now();
    try {
      const read = await client.fetchSignals(config);
      persisted.ecowatt = { ...persisted.ecowatt, signals: read };
      store.save(persisted);
      credentialsRefused = false;
      ecowattIssues.ok('read', 'EcoWatt answers again');
      logger.debug(`EcoWatt read: ${read.days.map((d) => `${d.date}=${d.level}`).join(' ')}`);
      await announceAlerts(read);
      gladys.requestWidgetRefresh(WIDGET_KEY);
      return read;
    } catch (err) {
      if (err instanceof QuotaError) {
        logger.debug(err.message);
        return null;
      }
      credentialsRefused = err instanceof CredentialsError;
      ecowattIssues.fail('read', `EcoWatt cannot be read: ${err.message}`);
      return null;
    }
  }

  /** Fire the trigger for every day newly orange or red, once per level. */
  async function announceAlerts(read) {
    const today = parisTime(now()).date;
    const announced = Object.fromEntries(
      Object.entries(persisted.announced).filter(([date]) => date >= today),
    );
    for (const day of read.days) {
      if (
        day.date < today ||
        day.level < LEVELS.ORANGE ||
        (announced[day.date] ?? 0) >= day.level
      ) {
        continue;
      }
      const daysAhead = Math.round((Date.parse(day.date) - Date.parse(today)) / 86_400_000);
      try {
        await gladys.publishSceneEvent(TRIGGER_KEY, {
          color: ALERT_COLORS[day.level],
          level: day.level,
          date: day.date,
          days_ahead: daysAhead,
          message: day.message.slice(0, 1000),
        });
        announced[day.date] = day.level;
        logger.info(`EcoWatt alert announced: ${ALERT_COLORS[day.level]} on ${day.date}`);
      } catch (err) {
        // Not remembered: announced again after the next reading.
        gladysIssues.fail('scene-event', `EcoWatt alert not sent to Gladys: ${err.message}`);
      }
    }
    persisted.announced = announced;
    store.save(persisted);
  }

  // --- States ---------------------------------------------------------------

  async function publishStates() {
    const states = [
      ...(isCreated(GRID) ? gridStates(gladys, mix, now()) : []),
      ...(hasEcowatt(config) && isCreated(ECOWATT) ? ecowattStates(gladys, signals(), now()) : []),
    ];
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      gladysIssues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      gladysIssues.fail('states', `States not accepted by Gladys: ${err.message}`);
    }
  }

  /** The application status of the Configuration screen, sent on change only. */
  async function reportStatus() {
    let status = { connected: true };
    if (credentialsRefused) {
      status = { connected: false, message: TEXT.ecowattRefused };
    } else if (eco2mixIssues.isFailing('read')) {
      status = { connected: false, message: TEXT.eco2mixDown };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = key;
    } catch (err) {
      logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- The tick ---------------------------------------------------------------

  /**
   * Read what is due, publish what changed. One tick at a time: a second
   * caller waits for the one in progress.
   * @param {object} [options]
   * @param {boolean} [options.force] read both APIs now (quota permitting)
   */
  async function tick({ force = false } = {}) {
    // A forced tick (new configuration) must not reuse a tick started with
    // the previous one: it waits for it, then runs.
    while (force && ticking) {
      await ticking.catch(() => {});
    }
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      lastTickAt = now();
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: tick skipped');
        return;
      }
      const wantsMix = isCreated(GRID) || now() - widgetShownAt < WIDGET_INTEREST_MS;
      if (force || (wantsMix && now() - mixAttemptAt >= MIX_PERIOD_MS)) {
        await refreshMix();
      }
      if (
        hasEcowatt(config) &&
        (force || now() - ecowattAttemptAt >= ECOWATT_PERIOD_MS) &&
        client.quotaWait() === 0
      ) {
        await refreshEcowatt();
      }
      await publishStates();
      await reportStatus();
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await tick();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, TICK_MS);
  }

  /** (Re)start: publish the devices, read everything, then every minute. */
  async function start() {
    await ready;
    stopped = false;
    credentialsRefused = false;
    lastStatus = null;
    client.reset();
    try {
      await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    if (!hasEcowatt(config)) {
      logger.info('EcoWatt: no key in the configuration, éCO2mix only');
    }
    schedule();
    await tick({ force: true });
  }

  // --- Handlers ---------------------------------------------------------------

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
  });

  gladys.onPoll(async () => {
    // Fallback of the timer: the core polls every minute, a tick runs only
    // when the timer has not ticked for most of a minute.
    if (now() - lastTickAt < TICK_MS * 0.9) {
      return;
    }
    await tick();
  });

  // A device just added: its states again now (the core dropped the ones it
  // received before the feature existed), and the widget gains its chart.
  const onDeviceAdded = async (device) => {
    if (device.external_id === deviceIds(gladys, GRID).device && !freshMix()) {
      await refreshMix();
    }
    await publishStates();
    gladys.requestWidgetRefresh(WIDGET_KEY);
  };
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);

  gladys.onAction(ACTION_KEY, async () => {
    logger.info('Action: test the connection to RTE');
    const parts = [];
    if (await refreshMix()) {
      const time = new Date(mix.at).toLocaleTimeString('fr', {
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(MESSAGES.eco2mixOk(mix.co2, time));
    } else {
      parts.push(TEXT.eco2mixDown);
    }
    if (!hasEcowatt(config)) {
      parts.push(TEXT.ecowattNotConfigured);
    } else {
      parts.push(await testEcowatt());
    }
    await publishStates();
    await reportStatus();
    return joinTexts(' ', ...parts);
  });

  async function testEcowatt() {
    try {
      await client.checkCredentials(config);
    } catch (err) {
      credentialsRefused = err instanceof CredentialsError;
      return credentialsRefused ? TEXT.ecowattRefused : MESSAGES.ecowattFailed(err.message);
    }
    credentialsRefused = false;
    const wait = client.quotaWait();
    if (wait > 0) {
      return MESSAGES.ecowattQuota(Math.ceil(wait / 60000));
    }
    const read = await refreshEcowatt();
    const today = read ? levelsAt(read, now()).today : null;
    return today ? MESSAGES.ecowattToday(today) : TEXT.ecowattKeyOk;
  }

  gladys.onWidgetGet(WIDGET_KEY, async ({ language }) => {
    widgetShownAt = now();
    if (!freshMix() && now() - mixAttemptAt >= MIX_PERIOD_MS) {
      await refreshMix({ nudge: false });
    }
    return buildWidgetContent({
      mix: freshMix(),
      ecowatt: hasEcowatt(config) ? levelsAt(signals(), now()) : null,
      co2Feature: isCreated(GRID) ? deviceIds(gladys, GRID).feature('carbon_intensity') : null,
      failing: eco2mixIssues.isFailing('read'),
      language,
    });
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('New configuration received');
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    ready,
    tick,
    /** For the tests: what the integration holds. */
    get mix() {
      return mix;
    },
    get signals() {
      return signals();
    },
    /** Stop the timer and wait for the last write under /data. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await ticking?.catch(() => {});
      await store.flush();
    },
  };
}
