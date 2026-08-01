import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const titlePage = fs.readFileSync(
  new URL('../src/app/title/[type]/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('sticky de títulos mantém apenas voltar e título central', () => {
  assert.match(titlePage, /aria-label="Voltar"/);
  assert.match(titlePage, /opacity: showNavTitle \? 1 : 0/);
  assert.match(
    titlePage,
    /\{!showNavTitle && \(\s*<>\s*<button className="ios-top-action" aria-label="Compartilhar"/,
  );
  assert.match(
    titlePage,
    /aria-label=\{isFav \? 'Remover dos favoritos' : 'Adicionar aos favoritos'\}/,
  );
});
