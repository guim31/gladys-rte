// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations. Brands (RTE, éCO2mix, EcoWatt) stay as is.
//
//   - NAMES    : device and feature names, written once in the language of
//                the configuration (Gladys freezes them when a device is added);
//   - TEXT     : the fixed texts (widget, configuration screen, actions);
//   - MESSAGES : the texts built from a value.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty text and no polite German.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** Device and feature names, by language then key. */
export const NAMES = {
  en: {
    grid: 'French power grid',
    ecowatt: 'EcoWatt',
    carbon_intensity: 'CO₂ intensity',
    consumption: 'National consumption',
    low_carbon_share: 'Low-carbon share',
    renewable_share: 'Renewable share',
    nuclear_share: 'Nuclear share',
    hydro_share: 'Hydro share',
    wind_share: 'Wind share',
    solar_share: 'Solar share',
    bioenergy_share: 'Bioenergy share',
    gas_share: 'Gas share',
    coal_share: 'Coal share',
    exchanges_share: 'Imports (+) / exports (−)',
    today: 'EcoWatt today',
    tomorrow: 'EcoWatt tomorrow',
    current_hour: 'EcoWatt this hour',
    region: 'Electricity',
    regional_consumption: 'Regional consumption',
    regional_production: 'Regional production',
    regional_exchanges: 'Exchanges (import + / export −)',
    coverage: 'Coverage (production / consumption)',
    thermal_share: 'Fossil thermal share',
    ecogaz: 'EcoGaz',
    gas_today: 'EcoGaz today',
    gas_tomorrow: 'EcoGaz tomorrow',
    gas_day_2: 'EcoGaz in 2 days',
    gas_day_3: 'EcoGaz in 3 days',
  },
  fr: {
    grid: 'Réseau électrique français',
    ecowatt: 'EcoWatt',
    carbon_intensity: 'Taux de CO₂',
    consumption: 'Consommation nationale',
    low_carbon_share: 'Part bas carbone',
    renewable_share: 'Part renouvelable',
    nuclear_share: 'Part du nucléaire',
    hydro_share: "Part de l'hydraulique",
    wind_share: "Part de l'éolien",
    solar_share: 'Part du solaire',
    bioenergy_share: 'Part des bioénergies',
    gas_share: 'Part du gaz',
    coal_share: 'Part du charbon',
    exchanges_share: 'Échanges (import + / export −)',
    today: "EcoWatt aujourd'hui",
    tomorrow: 'EcoWatt demain',
    current_hour: 'EcoWatt heure en cours',
    region: 'Électricité',
    regional_consumption: 'Consommation régionale',
    regional_production: 'Production régionale',
    regional_exchanges: 'Échanges (import + / export −)',
    coverage: 'Taux de couverture',
    thermal_share: 'Part du thermique fossile',
    ecogaz: 'EcoGaz',
    gas_today: "EcoGaz aujourd'hui",
    gas_tomorrow: 'EcoGaz demain',
    gas_day_2: 'EcoGaz dans 2 jours',
    gas_day_3: 'EcoGaz dans 3 jours',
  },
  de: {
    grid: 'Französisches Stromnetz',
    ecowatt: 'EcoWatt',
    carbon_intensity: 'CO₂-Intensität',
    consumption: 'Landesweiter Verbrauch',
    low_carbon_share: 'CO₂-armer Anteil',
    renewable_share: 'Erneuerbarer Anteil',
    nuclear_share: 'Anteil Kernenergie',
    hydro_share: 'Anteil Wasserkraft',
    wind_share: 'Anteil Windkraft',
    solar_share: 'Anteil Solarenergie',
    bioenergy_share: 'Anteil Bioenergie',
    gas_share: 'Anteil Gas',
    coal_share: 'Anteil Kohle',
    exchanges_share: 'Austausch (Import + / Export −)',
    today: 'EcoWatt heute',
    tomorrow: 'EcoWatt morgen',
    current_hour: 'EcoWatt aktuelle Stunde',
    region: 'Strom',
    regional_consumption: 'Regionaler Verbrauch',
    regional_production: 'Regionale Erzeugung',
    regional_exchanges: 'Austausch (Import + / Export −)',
    coverage: 'Deckungsgrad (Erzeugung / Verbrauch)',
    thermal_share: 'Anteil fossile Wärmekraft',
    ecogaz: 'EcoGaz',
    gas_today: 'EcoGaz heute',
    gas_tomorrow: 'EcoGaz morgen',
    gas_day_2: 'EcoGaz in 2 Tagen',
    gas_day_3: 'EcoGaz in 3 Tagen',
  },
  es: {
    grid: 'Red eléctrica francesa',
    ecowatt: 'EcoWatt',
    carbon_intensity: 'Intensidad de CO₂',
    consumption: 'Consumo nacional',
    low_carbon_share: 'Proporción baja en carbono',
    renewable_share: 'Proporción renovable',
    nuclear_share: 'Proporción nuclear',
    hydro_share: 'Proporción hidráulica',
    wind_share: 'Proporción eólica',
    solar_share: 'Proporción solar',
    bioenergy_share: 'Proporción de bioenergía',
    gas_share: 'Proporción de gas',
    coal_share: 'Proporción de carbón',
    exchanges_share: 'Intercambios (import. + / export. −)',
    today: 'EcoWatt hoy',
    tomorrow: 'EcoWatt mañana',
    current_hour: 'EcoWatt hora actual',
    region: 'Electricidad',
    regional_consumption: 'Consumo regional',
    regional_production: 'Producción regional',
    regional_exchanges: 'Intercambios (import. + / export. −)',
    coverage: 'Cobertura (producción / consumo)',
    thermal_share: 'Proporción térmica fósil',
    ecogaz: 'EcoGaz',
    gas_today: 'EcoGaz hoy',
    gas_tomorrow: 'EcoGaz mañana',
    gas_day_2: 'EcoGaz dentro de 2 días',
    gas_day_3: 'EcoGaz dentro de 3 días',
  },
};

/** Fixed texts. */
export const TEXT = {
  // Widget: tiles and rows (short)
  co2: { en: 'CO₂', fr: 'CO₂', de: 'CO₂', es: 'CO₂' },
  consumption: { en: 'Consumption', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
  lowCarbon: { en: 'Low-carbon', fr: 'Bas carbone', de: 'CO₂-arm', es: 'Bajo en carbono' },
  ecowattToday: {
    en: 'EcoWatt today',
    fr: "EcoWatt aujourd'hui",
    de: 'EcoWatt heute',
    es: 'EcoWatt hoy',
  },
  ecowattTomorrow: {
    en: 'EcoWatt tomorrow',
    fr: 'EcoWatt demain',
    de: 'EcoWatt morgen',
    es: 'EcoWatt mañana',
  },
  nuclear: { en: 'Nuclear', fr: 'Nucléaire', de: 'Kernenergie', es: 'Nuclear' },
  hydro: { en: 'Hydro', fr: 'Hydraulique', de: 'Wasserkraft', es: 'Hidráulica' },
  wind: { en: 'Wind', fr: 'Éolien', de: 'Wind', es: 'Eólica' },
  solar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  bioenergy: { en: 'Bioenergy', fr: 'Bioénergies', de: 'Bioenergie', es: 'Bioenergía' },
  gas: { en: 'Gas', fr: 'Gaz', de: 'Gas', es: 'Gas' },
  coal: { en: 'Coal', fr: 'Charbon', de: 'Kohle', es: 'Carbón' },
  oil: { en: 'Oil', fr: 'Fioul', de: 'Heizöl', es: 'Fueloil' },
  imports: { en: 'Imports', fr: 'Importations', de: 'Importe', es: 'Importaciones' },
  exports: { en: 'Exports', fr: 'Exportations', de: 'Exporte', es: 'Exportaciones' },
  green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  orange: { en: 'Orange', fr: 'Orange', de: 'Orange', es: 'Naranja' },
  red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
  co2Chart: {
    en: 'CO₂ over 24 h',
    fr: 'CO₂ sur 24 h',
    de: 'CO₂ über 24 h',
    es: 'CO₂ en 24 h',
  },

  // Widget: longer texts
  waiting: {
    en: 'Waiting for the first éCO2mix figures.',
    fr: 'En attente des premiers chiffres éCO2mix.',
    de: 'Warte auf die ersten éCO2mix-Werte.',
    es: 'A la espera de los primeros datos de éCO2mix.',
  },
  unreachable: {
    en: 'éCO2mix cannot be reached right now: the figures will come back on their own.',
    fr: 'éCO2mix est injoignable pour le moment : les chiffres reviendront d’eux-mêmes.',
    de: 'éCO2mix ist gerade nicht erreichbar: Die Werte kommen von selbst zurück.',
    es: 'No se puede acceder a éCO2mix en este momento: los datos volverán por sí solos.',
  },

  // Configuration screen and actions
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  ecowattRefused: {
    en: 'EcoWatt refuses the client id and secret: copy them again from your application on data.rte-france.com.',
    fr: "EcoWatt refuse l'ID client et l'ID secret : recopiez-les depuis votre application sur data.rte-france.com.",
    de: 'EcoWatt lehnt Client-ID und Secret ab: Kopiere sie erneut aus deiner Anwendung auf data.rte-france.com.',
    es: 'EcoWatt rechaza el ID de cliente y el secreto: cópielos de nuevo desde su aplicación en data.rte-france.com.',
  },
  eco2mixDown: {
    en: 'éCO2mix (RTE) does not answer: next try in 15 min.',
    fr: 'éCO2mix (RTE) ne répond pas : nouvel essai dans 15 min.',
    de: 'éCO2mix (RTE) antwortet nicht: nächster Versuch in 15 Min.',
    es: 'éCO2mix (RTE) no responde: nuevo intento en 15 min.',
  },
  ecowattNotConfigured: {
    en: 'EcoWatt: no key given, no EcoWatt device.',
    fr: "EcoWatt : aucune clé renseignée, pas d'appareil EcoWatt.",
    de: 'EcoWatt: kein Schlüssel angegeben, kein EcoWatt-Gerät.',
    es: 'EcoWatt: no se ha indicado ninguna clave, sin dispositivo EcoWatt.',
  },
  ecogazDown: {
    en: 'EcoGaz (ODRÉ) does not answer: next try in an hour.',
    fr: "EcoGaz (ODRÉ) ne répond pas : nouvel essai dans l'heure.",
    de: 'EcoGaz (ODRÉ) antwortet nicht: nächster Versuch in einer Stunde.',
    es: 'EcoGaz (ODRÉ) no responde: nuevo intento dentro de una hora.',
  },
  ecogazNoToday: {
    en: 'EcoGaz: no signal for today yet.',
    fr: "EcoGaz : pas encore de signal pour aujourd'hui.",
    de: 'EcoGaz: noch kein Signal für heute.',
    es: 'EcoGaz: todavía no hay señal para hoy.',
  },
  regionalDown: {
    en: 'éCO2mix regional (RTE) does not answer: next try in 15 min.',
    fr: 'éCO2mix régional (RTE) ne répond pas : nouvel essai dans 15 min.',
    de: 'éCO2mix regional (RTE) antwortet nicht: nächster Versuch in 15 Min.',
    es: 'éCO2mix regional (RTE) no responde: nuevo intento en 15 min.',
  },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  ecowattKeyOk: {
    en: 'EcoWatt: key accepted.',
    fr: 'EcoWatt : clé acceptée.',
    de: 'EcoWatt: Schlüssel akzeptiert.',
    es: 'EcoWatt: clave aceptada.',
  },
};

const LEVEL_TEXT = { 1: TEXT.green, 2: TEXT.orange, 3: TEXT.red };
/** EcoGaz levels 0 to 3 (src/ecogaz.js). */
const GAS_LEVEL_TEXT = [TEXT.green, TEXT.yellow, TEXT.orange, TEXT.red];

/** Texts built from a value. Each one returns the four languages. */
export const MESSAGES = {
  eco2mixOk: (co2, time) => ({
    en: `éCO2mix: ${co2} g CO₂/kWh at ${time}.`,
    fr: `éCO2mix : ${co2} g de CO₂/kWh à ${time}.`,
    de: `éCO2mix: ${co2} g CO₂/kWh um ${time}.`,
    es: `éCO2mix: ${co2} g de CO₂/kWh a las ${time}.`,
  }),
  ecowattFailed: (detail) => ({
    en: `EcoWatt cannot be read: ${detail}.`,
    fr: `EcoWatt illisible : ${detail}.`,
    de: `EcoWatt kann nicht gelesen werden: ${detail}.`,
    es: `No se puede leer EcoWatt: ${detail}.`,
  }),
  ecowattToday: (level) => ({
    en: `EcoWatt: key accepted, signal of the day: ${LEVEL_TEXT[level]?.en ?? '?'}.`,
    fr: `EcoWatt : clé acceptée, signal du jour : ${LEVEL_TEXT[level]?.fr ?? '?'}.`,
    de: `EcoWatt: Schlüssel akzeptiert, Signal des Tages: ${LEVEL_TEXT[level]?.de ?? '?'}.`,
    es: `EcoWatt: clave aceptada, señal del día: ${LEVEL_TEXT[level]?.es ?? '?'}.`,
  }),
  ecowattQuota: (minutes) => ({
    en: `EcoWatt: key accepted (signals read again in ${minutes} min, RTE allows one call every 15 min).`,
    fr: `EcoWatt : clé acceptée (signaux relus dans ${minutes} min, RTE autorise un appel toutes les 15 min).`,
    de: `EcoWatt: Schlüssel akzeptiert (Signale in ${minutes} Min. erneut gelesen, RTE erlaubt einen Aufruf alle 15 Min.).`,
    es: `EcoWatt: clave aceptada (señales leídas de nuevo en ${minutes} min, RTE permite una llamada cada 15 min).`,
  }),
  ecogazToday: (level) => ({
    en: `EcoGaz: signal of the day: ${GAS_LEVEL_TEXT[level]?.en ?? '?'}.`,
    fr: `EcoGaz : signal du jour : ${GAS_LEVEL_TEXT[level]?.fr ?? '?'}.`,
    de: `EcoGaz: Signal des Tages: ${GAS_LEVEL_TEXT[level]?.de ?? '?'}.`,
    es: `EcoGaz: señal del día: ${GAS_LEVEL_TEXT[level]?.es ?? '?'}.`,
  }),
  regionsOk: (read, total) => ({
    en: `éCO2mix regional: ${read} of ${total} regions read.`,
    fr: `éCO2mix régional : ${read} région(s) lue(s) sur ${total}.`,
    de: `éCO2mix regional: ${read} von ${total} Regionen gelesen.`,
    es: `éCO2mix regional: ${read} de ${total} regiones leídas.`,
  }),
  updatedAt: (time) => ({
    en: `RTE éCO2mix · ${time}`,
    fr: `RTE éCO2mix · ${time}`,
    de: `RTE éCO2mix · ${time}`,
    es: `RTE éCO2mix · ${time}`,
  }),
};

/** The name of a level, in four languages (null for an unknown one). */
export function levelText(level) {
  return LEVEL_TEXT[level] ?? null;
}

/**
 * One language of a multi-language text, English when the language is missing.
 * @param {Record<string, string>} text
 * @param {string} [language]
 */
export function pick(text, language) {
  return text[language] ?? text.en;
}

/** Join two multi-language texts, language by language. */
export function joinTexts(separator, ...texts) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [lang, texts.map((t) => t[lang]).join(separator)]),
  );
}
