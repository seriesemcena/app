import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('authentication requires a region before exposing sign-in and registration', async () => {
  const [authPage, regions] = await Promise.all([
    read('src/app/auth/page.tsx'),
    read('src/lib/regions.ts'),
  ]);

  assert.match(authPage, /useState<'region' \| 'landing' \| 'email'>\('region'\)/);
  assert.match(authPage, /localStorage\.getItem\(REGION_SELECTED_KEY\)/);
  assert.match(authPage, /localStorage\.setItem\(REGION_SELECTED_KEY, '1'\)/);
  assert.ok(authPage.indexOf("if (view === 'region')") < authPage.indexOf("if (view === 'landing')"));
  assert.match(authPage, /<BottomSheet visible=\{regionPickerOpen\}/);
  assert.doesNotMatch(authPage, /selectedRegion\.flag|\{region\.flag\}/);
  assert.match(regions, /sec_region_selected_v1/);
  assert.match(regions, /code: 'BR'/);
  assert.match(regions, /code: 'US'/);
  assert.match(regions, /code: 'ES'/);
});

test('region selection updates locale, profile preferences and TMDB region', async () => {
  const [authPage, localeContext, tmdb, languageSettings] = await Promise.all([
    read('src/app/auth/page.tsx'),
    read('src/context/LocaleContext.tsx'),
    read('src/lib/tmdb.ts'),
    read('src/app/settings/language/page.tsx'),
  ]);

  assert.match(authPage, /getDefaultLocaleForCountry\(code\)/);
  assert.match(authPage, /setCountry\(code\)/);
  assert.match(authPage, /setLocale\(locale\)/);
  assert.match(authPage, /prefsStore\.set/);
  assert.match(localeContext, /!prefs\.locale \|\| !prefs\.country/);
  assert.match(localeContext, /locale: nextLocale/);
  assert.match(localeContext, /country: nextCountry/);
  assert.match(tmdb, /localStorage\.getItem\('sec_country_v1'\)/);
  assert.match(languageSettings, /REGION_OPTIONS\.map/);
});

test('region onboarding is translated in the complete app languages', async () => {
  const translations = await Promise.all([
    read('src/locales/pt-BR/auth.json'),
    read('src/locales/en-US/auth.json'),
    read('src/locales/es-ES/auth.json'),
  ]);

  for (const translation of translations) {
    const parsed = JSON.parse(translation);
    assert.equal(typeof parsed.region.title, 'string');
    assert.equal(typeof parsed.region.label, 'string');
    assert.equal(typeof parsed.region.continue, 'string');
  }
});
