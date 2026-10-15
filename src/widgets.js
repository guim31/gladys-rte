// -----------------------------------------------------------------------------
// The "French power grid" dashboard widget: the CO₂ intensity, the national
// consumption and the low-carbon share as tiles, the EcoWatt signals of today
// and tomorrow (with a key), the 24-hour CO₂ curve from the history Gladys
// keeps (once the device is added), and the mix as bars, one row per source.
//
// The core vocabulary has no bar list: each row of the `status` component
// carries a ten-cell text bar ("███████░░░ 68 %"), the only way to draw the
// mix as bars in a card. Budget (core): 8 components, 6 tiles, 1 focal,
// 1 status, 2 texts — this content uses at most 5 tiles, 1 chart, 1 status
// and 1 caption, in the order of importance (the core drops from the end).
// -----------------------------------------------------------------------------

import {
  WIDGET_COLORS,
  WIDGET_CHART_INTERVALS,
  WIDGET_CHART_TYPES,
} from '@gladysassistant/integration-sdk';
import { MESSAGES, TEXT, levelText, pick } from './i18n.js';

export const WIDGET_KEY = 'grid';

/** The content is cached by the core: refetched every 5 minutes at most. */
export const WIDGET_TTL_SECONDS = 300;

const LEVEL_COLORS = {
  1: WIDGET_COLORS.SUCCESS,
  2: WIDGET_COLORS.WARNING,
  3: WIDGET_COLORS.DANGER,
};

/** Rows of the mix: source key → its text and the color of its dot. */
const MIX_ROWS = [
  ['nuclear', TEXT.nuclear, WIDGET_COLORS.SUCCESS],
  ['hydro', TEXT.hydro, WIDGET_COLORS.SUCCESS],
  ['wind', TEXT.wind, WIDGET_COLORS.SUCCESS],
  ['solar', TEXT.solar, WIDGET_COLORS.SUCCESS],
  ['bioenergy', TEXT.bioenergy, WIDGET_COLORS.SUCCESS],
  ['gas', TEXT.gas, WIDGET_COLORS.WARNING],
  ['coal', TEXT.coal, WIDGET_COLORS.DANGER],
  ['oil', TEXT.oil, WIDGET_COLORS.DANGER],
];

/** Same thresholds as the Gladys badge of the grid carbon category. */
export function co2Color(co2) {
  if (co2 < 150) {
    return WIDGET_COLORS.SUCCESS;
  }
  return co2 < 400 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.DANGER;
}

/** "███████░░░" for 68 %. */
export function bar(percent) {
  const cells = Math.max(0, Math.min(10, Math.round(Math.abs(percent) / 10)));
  return '█'.repeat(cells) + '░'.repeat(10 - cells);
}

/** 68 → "68 %", 3.4 → "3,4 %" in French: a decimal under 10 %. */
function percentText(value, language) {
  const shown = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${shown.toLocaleString(language)} %`;
}

/**
 * Build the widget content.
 * @param {object} options
 * @param {ReturnType<import('./eco2mix.js').parseMixRecord> | null} options.mix fresh enough to show
 * @param {{ today: number | null, tomorrow: number | null } | null} options.ecowatt null without a key
 * @param {string | null} options.co2Feature the CO₂ feature external_id, once the device exists
 * @param {boolean} options.failing éCO2mix cannot be read right now
 * @param {string} options.language
 * @param {string} [options.timeZone] for the time of the figures (Gladys' TZ by default)
 */
export function buildWidgetContent({ mix, ecowatt, co2Feature, failing, language, timeZone }) {
  const components = [];
  if (mix) {
    components.push(
      {
        type: 'value',
        label: pick(TEXT.co2, language),
        value: Math.round(mix.co2),
        unit: 'g/kWh',
        icon: 'cloud',
        color: co2Color(mix.co2),
      },
      {
        type: 'value',
        label: pick(TEXT.consumption, language),
        value: Number((mix.consumptionMw / 1000).toFixed(1)),
        unit: 'GW',
        icon: 'zap',
      },
      {
        type: 'value',
        label: pick(TEXT.lowCarbon, language),
        value: Math.round(mix.lowCarbonPercent),
        unit: '%',
        icon: 'feather',
      },
    );
  }
  if (ecowatt) {
    for (const [level, label] of [
      [ecowatt.today, TEXT.ecowattToday],
      [ecowatt.tomorrow, TEXT.ecowattTomorrow],
    ]) {
      if (levelText(level)) {
        components.push({
          type: 'value',
          label: pick(label, language),
          value: pick(levelText(level), language),
          icon: 'activity',
          color: LEVEL_COLORS[level],
        });
      }
    }
  }
  if (co2Feature) {
    components.push({
      type: 'chart',
      device_features: [co2Feature],
      interval: WIDGET_CHART_INTERVALS.LAST_DAY,
      chart_type: WIDGET_CHART_TYPES.BAR,
      title: pick(TEXT.co2Chart, language),
      unit: 'g/kWh',
    });
  }
  if (mix) {
    const rows = MIX_ROWS.map(([key, text, color]) => ({
      label: pick(text, language),
      percent: mix.sharesPercent[key],
      color,
    })).filter((row) => row.percent >= 0.5);
    rows.sort((a, b) => b.percent - a.percent);
    if (Math.abs(mix.exchangesPercent) >= 0.5) {
      rows.push({
        label: pick(mix.exchangesPercent > 0 ? TEXT.imports : TEXT.exports, language),
        percent: Math.abs(mix.exchangesPercent),
        color: WIDGET_COLORS.INFO,
      });
    }
    components.push({
      type: 'status',
      items: rows.slice(0, 10).map((row) => ({
        label: row.label,
        value: `${bar(row.percent)} ${percentText(row.percent, language)}`,
        color: row.color,
      })),
    });
    const time = new Date(mix.at).toLocaleTimeString(language, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    });
    components.push({
      type: 'text',
      variant: 'caption',
      text: pick(MESSAGES.updatedAt(time), language),
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(failing ? TEXT.unreachable : TEXT.waiting, language),
    });
  }
  return { ttl_seconds: WIDGET_TTL_SECONDS, components };
}
