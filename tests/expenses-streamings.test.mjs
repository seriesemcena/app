import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const logoNames = ['netflix', 'primevideo', 'dineyplus', 'hbomax', 'appletv', 'globoplay', 'paramountplus', 'mgm'];

test('expenses uses local light and dark streaming logos', async () => {
  await Promise.all(logoNames.flatMap((name) => [
    access(new URL(`public/${name}_logo.png`, projectRoot)),
    access(new URL(`public/${name}_logo_black.png`, projectRoot)),
  ]));

  const source = await readFile(new URL('src/app/expenses/page.tsx', projectRoot), 'utf8');
  assert.match(source, /src=\{`\/\$\{logo\}_logo\$\{isDark \? '' : '_black'\}\.png`\}/);
  assert.match(source, /id: 'mgm', name: 'MGM\+'/);
  assert.doesNotMatch(source, /id: 'star', name: 'Star\+'/);
});

test('expenses keeps the 2026 Brazil prices and only shows the secondary action with subscriptions', async () => {
  const source = await readFile(new URL('src/app/expenses/page.tsx', projectRoot), 'utf8');
  const locale = await readFile(new URL('src/locales/pt-BR/settings.json', projectRoot), 'utf8');

  assert.match(source, /label: 'Premium', price: 59\.90/);
  assert.match(source, /label: 'Mensal', price: 19\.90/);
  assert.match(source, /label: 'Premium anual \(R\$ 399,90\/ano\)', price: 399\.90 \/ 12/);
  assert.match(source, /expenses\.addAnotherStreaming/);
  assert.match(source, /subs\.length === 0[\s\S]*?\) : \([\s\S]*?expenses\.addAnotherStreaming/);
  assert.doesNotMatch(source, /label=\{t\('expenses\.addBtn'\)\} variant="pink" size="sm"/);
  assert.match(locale, /"addAnotherStreaming": "Adicionar outro streaming"/);
});

test('each subscription can edit its plan and monthly price', async () => {
  const source = await readFile(new URL('src/app/expenses/page.tsx', projectRoot), 'utf8');
  const locale = await readFile(new URL('src/locales/pt-BR/settings.json', projectRoot), 'utf8');

  assert.match(source, /onClick=\{\(\) => openEditSub\(s\)\}/);
  assert.match(source, /sub\.id === editingSub\.id \? \{ \.\.\.sub, plan, price \} : sub/);
  assert.match(source, /inputMode="decimal"/);
  assert.match(source, /setEditPlan\(plan\.label\); setEditPrice\(formatPrice\(plan\.price\)\)/);
  assert.match(locale, /"editSubscription": "Editar assinatura"/);
  assert.match(locale, /"saveChanges": "Salvar alterações"/);
});
