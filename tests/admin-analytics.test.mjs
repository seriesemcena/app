import assert from 'node:assert/strict';
import { test } from 'node:test';
import analytics from '../functions/admin-analytics.js';

const now = Date.parse('2026-07-20T12:00:00.000Z');

test('title rankings separate added and watched and deduplicate each user/title', () => {
  const base = { uid: 'u1', titleKey: 'movie_1', titleId: '1', titleName: 'Filme A', titleType: 'movie', createdAt: '2026-07-19T12:00:00.000Z' };
  const rankings = analytics.buildTitleRankings([
    { ...base, action: 'want' },
    { ...base, action: 'watching' },
    { ...base, action: 'watched' },
    { ...base, uid: 'u2', action: 'watched' },
    { ...base, uid: 'u3', titleKey: 'tv_2', titleId: '2', titleName: 'Série B', titleType: 'tv', action: 'want' },
    { ...base, uid: 'u4', action: 'reviewed' },
  ], now);

  assert.equal(rankings.weekly.added.find((item) => item.titleKey === 'movie_1').count, 1);
  assert.equal(rankings.weekly.watched[0].count, 2);
  assert.equal(rankings.weekly.added.find((item) => item.titleKey === 'tv_2').titleType, 'tv');
});

test('title rankings honor weekly, monthly and yearly windows', () => {
  const rankings = analytics.buildTitleRankings([
    { uid: 'u1', titleKey: 'movie_1', titleName: 'Semana', titleType: 'movie', action: 'want', createdAt: '2026-07-19T12:00:00.000Z' },
    { uid: 'u2', titleKey: 'movie_2', titleName: 'Mês', titleType: 'movie', action: 'want', createdAt: '2026-07-01T12:00:00.000Z' },
    { uid: 'u3', titleKey: 'tv_3', titleName: 'Ano', titleType: 'tv', action: 'watched', createdAt: '2026-02-01T12:00:00.000Z' },
  ], now);

  assert.equal(rankings.weekly.added.length, 1);
  assert.equal(rankings.monthly.added.length, 2);
  assert.equal(rankings.yearly.watched.length, 1);
});
