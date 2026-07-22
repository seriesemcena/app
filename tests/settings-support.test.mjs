import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
