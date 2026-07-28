import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('settings links support to the Maratonou community in every language', async () => {
  const [settingsPage, ptBR, enUS, esES] = await Promise.all([
    readFile(new URL('src/app/settings/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/locales/pt-BR/settings.json', projectRoot), 'utf8'),
    readFile(new URL('src/locales/en-US/settings.json', projectRoot), 'utf8'),
    readFile(new URL('src/locales/es-ES/settings.json', projectRoot), 'utf8'),
  ]);

  assert.match(settingsPage, /const COMMUNITY_URL = 'https:\/\/community\.maratonou\.com'/);
  assert.match(settingsPage, /icon: 'message', label: t\('items\.support'\)/);
  assert.match(settingsPage, /window\.location\.assign\(COMMUNITY_URL\)/);

  assert.equal(JSON.parse(ptBR).items.support, 'Suporte');
  assert.equal(JSON.parse(enUS).items.support, 'Support');
  assert.equal(JSON.parse(esES).items.support, 'Soporte');
});

test('settings keeps streaming expenses and removes the redundant streaming selector', async () => {
  const [settingsPage, ptBR, enUS, esES] = await Promise.all([
    readFile(new URL('src/app/settings/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/locales/pt-BR/settings.json', projectRoot), 'utf8'),
    readFile(new URL('src/locales/en-US/settings.json', projectRoot), 'utf8'),
    readFile(new URL('src/locales/es-ES/settings.json', projectRoot), 'utf8'),
  ]);

  assert.match(settingsPage, /label: t\('items\.expenses'\),\s+onClick: \(\) => router\.push\(withProfileOrigin\('\/expenses'\)\)/);
  assert.doesNotMatch(settingsPage, /settings\/streamings|items\.streamings/);

  for (const locale of [ptBR, enUS, esES]) {
    assert.equal(Object.hasOwn(JSON.parse(locale).items, 'streamings'), false);
  }

  await assert.rejects(access(new URL('src/app/settings/streamings/page.tsx', projectRoot)));
});

test('settings notification action stays visible in the light header', async () => {
  const settingsPage = await readFile(new URL('src/app/settings/page.tsx', projectRoot), 'utf8');

  assert.match(settingsPage, /aria-label=\{t\('items\.notifications'\)\}/);
  assert.match(settingsPage, /background: isDark \? 'rgba\(255,255,255,0\.10\)' : 'rgba\(255,255,255,0\.92\)'/);
  assert.match(settingsPage, /<Icon name="bell" size=\{16\} color=\{isDark \? '#fff' : '#1A1A1A'\}/);
});
