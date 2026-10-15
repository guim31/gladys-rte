# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- **French power grid** device (RTE éCO2mix, no account): CO₂ intensity in g/kWh, national
  consumption, low-carbon and renewable shares, the share of nuclear, hydro, wind, solar,
  bioenergy, gas and coal, and the imports or exports, every quarter-hour.
- **EcoWatt** device, with a free key from data.rte-france.com: the signal of today, of tomorrow
  and of the current hour (0 carbon-free, 1 green, 2 orange, 3 red), within RTE's quota of one
  call every 15 minutes, kept across restarts.
- **EcoWatt alert announced** scene trigger: an orange or red day announced, today or in the next
  three days, once per announcement.
- **French power grid** dashboard widget: CO₂, consumption, low-carbon share, EcoWatt today and
  tomorrow, the 24-hour CO₂ curve and the mix as bars.
- **Test the connection to RTE** button in the configuration.
- Every text in English, French, German and Spanish, with the documentation in the four languages.

[Unreleased]: https://github.com/guim31/gladys-rte/commits/main
