# RTE éCO2mix & EcoWatt

Follow the French power grid in Gladys, as RTE publishes it in open data: how much CO₂ each
kilowatt-hour produced right now emits, where the electricity comes from (nuclear, wind, solar,
dams, gas…), and the **EcoWatt** signal, the "electricity weather" that warns when the grid is
tight and consumption should go down.

Enough to start the dishwasher, the water heater or the car charge when electricity is cleanest,
and to be told the day before an orange or red day.

> **Developed without access to the RTE APIs: feedback welcome.** This integration was built and
> tested on the formats RTE documents (éCO2mix on ODRÉ, EcoWatt API v5), without an EcoWatt account
> or a real call. If something does not work as described, say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-rte/issues).

Independent integration, not affiliated with RTE. The data remain RTE's.

## Overview

The integration reads two RTE sources:

- **éCO2mix** (open data, no account, no key): the production mix of mainland France every
  quarter-hour, the national consumption and the **CO₂ intensity** in grams per kilowatt-hour.
- **EcoWatt** (free key to create, optional): the signal of today and the next three days, hour by
  hour. Green: no tension. Orange: tight grid, saving energy helps. Red: very tight grid, power
  cuts are possible if consumption does not go down.

It adds two devices, a dashboard widget and an "EcoWatt alert announced" scene trigger.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Internet access from Gladys (the data come from RTE's servers).
- For EcoWatt only: a free account on [data.rte-france.com](https://data.rte-france.com) and an
  application subscribed to the **Ecowatt** API:
  1. Create your account on data.rte-france.com and sign in.
  2. In the API catalog, open **Ecowatt** (version 5), then **Subscribe to the API**: the portal
     offers to create an application, give it a name (for example "Gladys").
  3. In **My applications**, open that application: it shows a **client ID** and a **secret ID**.
     Those are the two values to copy into Gladys.

Without a key, the integration works with éCO2mix alone.

## Configuration

1. Install the integration from the Gladys catalog (or **Integrations → Install from GitHub** with
   the address of this repository).
2. In **Configuration**, paste the **EcoWatt client ID** and the **EcoWatt client secret** if you
   want EcoWatt. The secret stays in Gladys and never appears in the logs.
3. Choose the **Language of the feature names** (French by default). Names are given when a device
   is added and do not change afterwards.
4. Save, then open the **Discovery** tab: add **French power grid** and, with a key, **EcoWatt**.

### "Test the connection to RTE" button

Reads éCO2mix at once and shows the CO₂ intensity of the last quarter-hour published. With a key,
also checks that RTE accepts it and gives the EcoWatt signal of the day. RTE allows only one call
to the EcoWatt signals every quarter-hour: if the last one is too recent, the button checks the key
alone and says in how many minutes the signals will be read again.

## The devices

### French power grid

Updated every quarter-hour, at the pace of RTE's data:

| Feature                    | What it measures                                                    |
| -------------------------- | ------------------------------------------------------------------- |
| CO₂ intensity              | Grams of CO₂ per kilowatt-hour produced in France (g CO₂eq/kWh)     |
| National consumption       | The consumption of mainland France, in kW (Gladys has no GW unit)   |
| Low-carbon share           | Nuclear and renewables, in % of the production                      |
| Renewable share            | Hydro, wind, solar and bioenergy, in % of the production            |
| Nuclear share, wind share… | The share of each source in the production, in whole %              |
| Imports (+) / exports (−)  | What the neighbours supply (+) or take (−), in % of the consumption |

In France, the CO₂ intensity mostly stays between 15 and 80 g/kWh; it rises when gas or coal plants
run, usually on winter evenings. Gladys colors the badge: green under 150, orange up to 400, red
above.

### EcoWatt

With a key, three features give the EcoWatt signal as RTE numbers it:

| Feature           | Values                                             |
| ----------------- | -------------------------------------------------- |
| EcoWatt today     | 1 green, 2 orange, 3 red                           |
| EcoWatt tomorrow  | 1 green, 2 orange, 3 red                           |
| EcoWatt this hour | 0 carbon-free production, 1 green, 2 orange, 3 red |

Gladys shows them as a risk level: 0 "No risk", 1 "Low", 2 "Medium", 3 "High". A green day thus
shows as a yellow "Low" badge: that is Gladys' color for a low risk, not an alert. The current hour
changes on every full hour.

## Widget

The **French power grid** widget goes on the dashboard. It shows:

- the CO₂ intensity, the national consumption in GW and the low-carbon share;
- with a key, the EcoWatt signal of today and tomorrow, in green, orange or red;
- the 24-hour CO₂ curve as bars, once the device is added (Gladys keeps the history);
- the production mix as bars, source by source, with the imports or exports;
- the time of the quarter-hour shown.

## Scene trigger

**EcoWatt alert announced** (in the **Integrations** category of the scene editor): RTE announces an
orange or red day, today or in the next three days. The trigger fires **once per announcement**:
when a day turns orange, then again if it turns red, never on every reading, even after a restart.

Filters (left empty, everything matches): the **Signal** (orange, red) and the **Day concerned**
(today, tomorrow, in two or three days).

Information passed on to the scene actions: the signal (`orange` or `red`), the EcoWatt level
(2 or 3), the date of the day concerned, in how many days, and RTE's message.

To react to the CO₂ intensity, no dedicated trigger is needed: the native Gladys trigger "A device
changes state" already compares the **CO₂ intensity** feature with a threshold.

## Scene examples

- **Low CO₂ → start the dishwasher or the charge.** Trigger: "A device changes state", **CO₂
  intensity** under 40 g/kWh. Condition: between 10:00 and 16:00 (or in your off-peak hours).
  Action: turn on the plug of the dishwasher loaded in the morning, or the charging station.
- **Red day tomorrow → tell the household.** Trigger: **EcoWatt alert announced**, red signal, day
  concerned tomorrow. Action: send a message "Red EcoWatt day tomorrow: no oven or washing machine
  from 8:00 to 13:00 and from 18:00 to 20:00".
- **Orange or red hour → delay the car charge.** Trigger: "A device changes state", **EcoWatt this
  hour** greater than or equal to 2. Action: turn the charging plug off. A second scene turns it
  back on when the value goes under 2.

## Reading pace and quotas

- **éCO2mix** is read every quarter-hour, only when the device is added or the widget is shown:
  96 calls a day at most, no key. RTE publishes each quarter-hour about an hour late: the figures
  shown are often an hour old.
- **EcoWatt** is read every 30 minutes. RTE allows **only one call to the signals every 15 minutes**
  per application: the integration never calls more often, remembers it after a restart (in
  `/data`) and waits as long as RTE asks when it answers "too many requests".
- Only the changes are sent to Gladys, and every value is sent again at least every 6 hours to stay
  dated.

The use of the data follows RTE's terms: ODRÉ's open licence for éCO2mix, the terms of use of the
data.rte-france.com portal for EcoWatt.

## Troubleshooting

- **"EcoWatt refuses the client id and secret"** in the configuration screen: copy both values again
  from **My applications** on data.rte-france.com, without spaces, and check that the application is
  subscribed to the **Ecowatt** API.
- **"éCO2mix (RTE) does not answer"**: RTE's service is down or Gladys has no internet access. The
  integration tries again by itself every quarter-hour.
- **No value on the power grid**: a value more than three hours old is not sent (better no value
  than a wrong one). Use the **Test the connection to RTE** button.
- **More details**: the integration logs (Supervision tab) only show the useful events. To see
  everything, set the variable `LOG_LEVEL=debug`.

## Limits

- Mainland France only (without Corsica or the overseas territories), like éCO2mix.
- The shares by source are whole percentages; the widget shows a decimal under 10 %.
- The consumption is in kW on the device: Gladys has no MW or GW unit. The widget shows GW.
- Oil (under 1 % of the production) has no feature of its own; it appears in the widget above
  0.5 %.
- The RTE message passed on to scenes is in French, as RTE publishes it.
- EcoWatt gives no CO₂ forecast: there is no forecast of the CO₂ intensity in this integration.
