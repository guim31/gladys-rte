# RTE éCO2mix, EcoWatt & EcoGaz for Gladys Assistant

The French power grid in [Gladys Assistant](https://gladysassistant.com), from RTE's open data: the
**CO₂ intensity** of the electricity produced in France right now, the **electricity mix**
(nuclear, wind, solar, hydro, gas, coal…), the national consumption, and the **EcoWatt** signal
that warns of tight days on the grid. Since 1.1, the same figures **region by region**, and the
**EcoGaz** signal of the French gas network.

> **Developed without the account: feedback welcome.** The development environment could reach
> neither RTE API, and had no EcoWatt key. The integration was built and tested on the formats RTE
> documents; `scripts/probe.mjs` checks it against the real APIs. If something does not work as
> described, open an [issue](https://github.com/guim31/gladys-rte/issues) or say so on the
> [Gladys forum](https://community.gladysassistant.com).
>
> The regional éCO2mix and EcoGaz (1.1) were developed with network access: their fixtures are real
> ODRÉ answers, and the clients were run against the live API.

## Features

- **French power grid** device (éCO2mix, no account, no key), updated every quarter-hour: CO₂
  intensity (g CO₂eq/kWh), national consumption, low-carbon and renewable shares (the Gladys grid
  carbon sensor), the share of nuclear, hydro, wind, solar, bioenergy, gas and coal, and the
  imports (+) or exports (−).
- **EcoWatt** device (with a free key from data.rte-france.com): the signal of today, of tomorrow
  and of the current hour, numbered as RTE does (0 carbon-free hour, 1 green, 2 orange, 3 red).
- **EcoWatt alert announced** scene trigger: an orange or red day announced, today or in the next
  three days, once per announcement (remembered across restarts). For "CO₂ under a threshold",
  Gladys' native device trigger already does the job.
- **Electricity <region>** devices (éCO2mix regional, no key), one per region chosen among the
  twelve of mainland France: consumption, production, exchanges with the neighbours (kW), coverage
  (production out of consumption), low-carbon and renewable shares, the share of each source.
- **EcoGaz** device (GRTgaz and Teréga, open data): the gas network signal of today and the next
  three days, 0 green, 1 yellow, 2 orange, 3 red (the GRTgaz color minus one, so that Gladys' risk
  badge shows the same colors).
- **EcoGaz alert announced** scene trigger: today or tomorrow orange or red, once per day and color
  (remembered across restarts).
- **French power grid** dashboard widget: CO₂, consumption, low-carbon share, EcoWatt today and
  tomorrow, the 24-hour CO₂ curve, and the mix as bars.
- Every text in English, French, German and Spanish; full user documentation in
  [`docs/`](docs/fr.md).

### EcoWatt in the Gladys core

Gladys (5.2.1) already has an EcoWatt **dashboard widget** and an EcoWatt **scene condition** (the
signal of the current hour when a scene runs), fed by the Gladys servers (`server/services/ecowatt`,
`gladys.gateway.getEcowattSignals`, an unauthenticated relay: no Gladys Plus subscription and no RTE
key needed). It has no EcoWatt device and no EcoWatt trigger. So:

- to just see EcoWatt on the dashboard, the core widget is enough;
- this integration's EcoWatt part is for **scenes**: a device (today, tomorrow, current hour, with
  history and the native device trigger) and the "EcoWatt alert announced" trigger, read straight
  from RTE with the user's own key, not through the Gladys servers;
- éCO2mix (CO₂ intensity, mix, consumption) is this integration's alone.

## Requirements

- Gladys Assistant 5.1.0 or later, with internet access.
- For EcoWatt only: a free application on [data.rte-france.com](https://data.rte-france.com),
  subscribed to the Ecowatt API (v5). Its client ID and secret go into the configuration.

## Installation

In Gladys: **Integrations → Install from GitHub**, with `https://github.com/guim31/gladys-rte` (or
from the catalog once published). Then fill in the configuration (optional EcoWatt key, language of
the feature names) and add the devices from the **Discovery** tab. The detailed walkthrough is in
[`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)).

## How it works

- **éCO2mix**: ODRÉ's API (Opendatasoft v2.1), dataset `eco2mix-national-tr`, asking for the newest
  rows that carry a CO₂ value and keeping the most recent complete one (the rows of the current day
  exist ahead of time, empty). Read every 15 minutes, only while the grid device is added or the
  widget is shown. A mix more than three hours old is not published.
- **éCO2mix regional**: dataset `eco2mix-regional-tr`, one request for every region chosen
  (`code_insee_region in (…) and consommation is not null`), keeping per region the newest row
  whose consumption, sources and exchanges are all filled in. Read every 15 minutes while a region
  device is added. No CO₂ intensity: RTE does not publish one per region.
- **EcoGaz**: dataset `signal-ecogaz` (`gas_day`, `indice_de_couleur` 1 to 4), read every hour for
  the device and the trigger; GRTgaz updates it once a day around 11:00.
- **EcoWatt**: OAuth2 client credentials (`/token/oauth/`, HTTP Basic), then
  `/open_api/ecowatt/v5/signals`. RTE allows **one call to the signals every 15 minutes**: the
  integration reads them every 30 minutes, never sooner than the quota, keeps the time of the last
  call in `/data` across restarts and honours `Retry-After`. Days and hours are French ones
  (`Europe/Paris`), whatever the time zone of Gladys.
- **Refresh**: the container ticks every minute on its own timer (the core does not reliably poll
  external devices, Gladys#3198); the devices also declare a one-minute poll, and the core's
  `onPoll` is a fallback that only ticks when the timer missed one. Only the changed values are
  published, each one again at least every 6 hours.
- **Logs**: nothing at the info level for a normal cycle; a lasting failure is one warning when it
  starts and one line when it ends; `LOG_LEVEL=debug` shows the rest. The client secret and the
  tokens never appear in the logs.

## Checked, and what was not

Checked in this repository: the test suite (fake Gladys of the SDK, fake RTE), the conformity test
against the core's table of category/type couples, the store validator.

Not checked: a real answer of either API (the development environment was cut from RTE), a real
EcoWatt key, a real Gladys instance. `node scripts/probe.mjs` (add `RTE_CLIENT_ID` and
`RTE_CLIENT_SECRET` for EcoWatt, `--save DIR` to refresh the fixtures) runs the integration's own
clients against the real APIs, read-only, and prints no secret. The fixtures in `test/fixtures/`
follow the documented formats: refresh them from a probe run.

## Limitations

- Mainland France only, like éCO2mix; the figures arrive about an hour after the fact.
- The shares are whole percentages on the devices (Gladys has no generic decimal percentage
  sensor: they use the counter couple with a `%` unit); the widget shows a decimal under 10 %.
- The consumption is in kW on the device: Gladys has no MW or GW unit.
- Regions: no Corsica (not in the dataset), no CO₂ intensity.
- On the EcoWatt features, Gladys' risk badge shows a green day (1) as a yellow "Low".
- No CO₂ forecast: neither API publishes one.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
node scripts/probe.mjs   # needs the network
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules. Versions, images and releases belong to the
Release workflow (Actions → Release).

## Credits

- [RTE](https://www.rte-france.com): the éCO2mix data published on
  [ODRÉ](https://odre.opendatasoft.com) and the EcoWatt API of
  [data.rte-france.com](https://data.rte-france.com), and the regional éCO2mix data.
- [GRTgaz/NaTran](https://www.grtgaz.com) and [Teréga](https://www.terega.fr): the EcoGaz signal
  published on ODRÉ under the Etalab open licence 2.0 ([myecogaz.com](https://myecogaz.com)).
- [rte-ecowatt](https://github.com/kamaradclimber/rte-ecowatt) by kamaradclimber and contributors
  (Apache-2.0), the Home Assistant (HACS) integration: the OAuth flow, the v5 endpoints, matching
  the days by date and the hours by `pas`, the 429 behaviour. No code was copied.
- [pyecowatt](https://gitlab.com/Darathor/pyecowatt) by Darathor (BSD-3-Clause): the error answers
  of the token endpoint and the `Retry-After` of the signals. No code was copied.
- The architecture, the conformity and language tests follow
  [gladys-wled](https://github.com/guim31/gladys-wled), the persistence
  [gladys-pihole](https://github.com/guim31/gladys-pihole), the deduplicated logs
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by RTE (Réseau de Transport
d'Électricité), GRTgaz/NaTran or Teréga. éCO2mix and EcoWatt are RTE services, EcoGaz a service of
the gas transmission operators; their data stay subject to their terms of use.

## License

Apache-2.0
