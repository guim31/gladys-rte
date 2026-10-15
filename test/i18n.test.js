// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the texts of the code, the
// feature names and the documentation. German says "du", never the polite
// "Sie"; the four docs have the same sections. (From guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { MESSAGES, NAMES, TEXT, levelText } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const docs = Object.fromEntries(
  await Promise.all(
    ['en', 'fr', 'de', 'es'].map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 30, `only ${texts.length} texts found in the manifest`);
  assert.deepEqual(
    texts.flatMap(({ path, value, max }) => problems(value, path, max)),
    [],
  );
});

test('the manifest name is the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
});

// Widget tiles and labels are short; the rest are messages.
const SHORT = new Set([
  'co2',
  'consumption',
  'lowCarbon',
  'ecowattToday',
  'ecowattTomorrow',
  'nuclear',
  'hydro',
  'wind',
  'solar',
  'bioenergy',
  'gas',
  'coal',
  'oil',
  'imports',
  'exports',
  'co2Chart',
]);

test('every text of the code has the four languages', () => {
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(value, `TEXT.${key}`, SHORT.has(key) ? MAX.short : MAX.message),
  );
  // The colors are tile values: 12 characters at most.
  for (const level of [1, 2, 3]) {
    found.push(...problems(levelText(level), `levelText(${level})`, 12));
  }
  const samples = {
    eco2mixOk: [23, '14:15'],
    ecowattFailed: ['EcoWatt answered HTTP 503'],
    ecowattToday: [2],
    ecowattQuota: [14],
    updatedAt: ['14:15'],
  };
  assert.deepEqual(sorted(Object.keys(MESSAGES)), sorted(Object.keys(samples)));
  for (const [key, args] of Object.entries(samples)) {
    found.push(...problems(MESSAGES[key](...args), `MESSAGES.${key}`, MAX.message));
  }
  assert.deepEqual(found, []);
});

test('the device and feature names exist in every language, within 40 characters', () => {
  const found = [];
  for (const lang of LANGS) {
    assert.deepEqual(sorted(Object.keys(NAMES[lang])), sorted(Object.keys(NAMES.en)), lang);
    for (const [key, name] of Object.entries(NAMES[lang])) {
      found.push(...textProblems(name, `NAMES.${lang}.${key}`, lang, MAX.featureName));
    }
  }
  assert.deepEqual(found, []);
});

/** The `##` headings of a doc, in order. */
const sections = (markdown) => markdown.split('\n').filter((line) => line.startsWith('## '));

test('the four docs have the same sections, and German says "du"', () => {
  const count = sections(docs.en).length;
  assert.ok(count >= 8, `docs/en.md has ${count} sections`);
  for (const lang of LANGS) {
    assert.equal(sections(docs[lang]).length, count, `docs/${lang}.md has another set of sections`);
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    // Same subsections too: each device, widget, trigger and action.
    assert.equal(
      docs[lang].split('\n').filter((line) => line.startsWith('### ')).length,
      docs.en.split('\n').filter((line) => line.startsWith('### ')).length,
      `docs/${lang}.md has another set of subsections`,
    );
  }
  const polite = docs.de.split('\n').filter((line) => POLITE_GERMAN.test(line));
  assert.deepEqual(polite, []);
});

test('every doc says it was developed without the account, and not affiliated with RTE', () => {
  assert.match(docs.en, /Developed without [^\n]*feedback welcome/i);
  assert.match(docs.fr, /Développée sans [^\n]*retours sont les bienvenus/i);
  assert.match(docs.de, /Ohne [^\n]*entwickelt: Rückmeldungen willkommen/i);
  assert.match(docs.es, /Desarrollada sin [^\n]*comentarios son bienvenidos/i);
  for (const lang of LANGS) {
    assert.match(docs[lang], /RTE/);
  }
  assert.match(docs.en, /not affiliated with RTE/i);
  assert.match(docs.fr, /sans lien avec RTE/i);
  assert.match(docs.de, /nicht mit RTE verbunden/i);
  assert.match(docs.es, /sin relación con RTE/i);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Grid', fr: 'Réseau', de: 'Netz' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Grid', fr: 'Réseau', de: '', es: 'Red' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Schlüssel', 'Ihre Anwendung', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_triggers[0].fields[0].options[1].label.de;
  assert.deepEqual(
    manifestTexts(forgotten).flatMap(({ path, value, max }) => problems(value, path, max)),
    [
      'manifest.scene_triggers[0].fields[0].options[1].label has [en,fr,es], expected exactly [en,fr,de,es]',
    ],
  );
});
