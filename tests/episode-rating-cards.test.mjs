import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('episode ratings split overall average and current user score into two cards', async () => {
  const episode = await readFile(new URL('src/app/episode/page.tsx', projectRoot), 'utf8');

  assert.match(episode, /data-episode-rating-cards/);
  assert.match(episode, /gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)'/);
  assert.match(episode, /\{t\('overallRating'\)\}/);
  assert.match(episode, /\{t\('yourRating'\)\}/);
  assert.match(episode, /<Icon name="star" size=\{16\} color=\{T\.gold\} \/>/);
  assert.match(episode, /color: T\.gold/);
  assert.doesNotMatch(episode, /background: '#FFEB13'/);
});

test('episode rating card labels are localized', async () => {
  for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
    const messages = JSON.parse(await readFile(new URL(`src/locales/${locale}/title.json`, projectRoot), 'utf8'));
    assert.ok(messages.overallRating);
    assert.ok(messages.yourEpisodeRating);
    assert.ok(messages.notRatedByYou);
  }
});
