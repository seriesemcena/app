import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/seasonProgress.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const progress = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const {
  calculateWatchedDuration,
  classifySeries,
  legacyHistoryToSeasonProgress,
  mergeSeasonProgress,
  seasonProgressId,
  seasonState,
  splitSeasonMinutes,
  summarizeSeriesCompletion,
  uniqueEpisodeNumbers,
} = progress;

const NOW = new Date('2026-07-30T12:00:00Z');
const completed = (seasonNumber, episodeCount = 8) => ({
  uid: 'u1',
  seriesId: 100,
  seasonNumber,
  watchedEpisodeNumbers: Array.from({ length: episodeCount }, (_, index) => index + 1),
  episodeDurations: Object.fromEntries(
    Array.from({ length: episodeCount }, (_, index) => [String(index + 1), 50]),
  ),
  episodeCount,
  watchedDurationMinutes: episodeCount * 50,
  completedAt: '2026-07-01T12:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
  source: 'season-finish',
  schemaVersion: 1,
});

test('três temporadas concluídas classificam a série como finalizada', () => {
  const seasons = [1, 2, 3].map((seasonNumber) => ({
    seasonNumber, episodeCount: 8, airDate: `202${seasonNumber}-01-01`,
  }));
  assert.equal(classifySeries(seasons, [1, 2, 3].map((season) => completed(season)), NOW), 'finished');
});

test('adicionar temporada futura não retira a série de finalizadas', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2024-01-01' },
    { seasonNumber: 3, episodeCount: 8, airDate: '2025-01-01' },
    { seasonNumber: 4, episodeCount: 8, airDate: '2026-10-01' },
  ];
  assert.equal(classifySeries(seasons, [1, 2, 3].map((season) => completed(season)), NOW), 'finished');
});

test('quando a nova temporada estreia, a série volta para maratonando', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2024-01-01' },
    { seasonNumber: 3, episodeCount: 8, airDate: '2025-01-01' },
    { seasonNumber: 4, episodeCount: 8, airDate: '2026-07-29' },
  ];
  assert.equal(classifySeries(seasons, [1, 2, 3].map((season) => completed(season)), NOW), 'watching');
});

test('progresso parcial da nova temporada permanece maratonando', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2026-07-01' },
  ];
  const partial = {
    ...completed(2),
    watchedEpisodeNumbers: [1, 2],
    completedAt: null,
    watchedDurationMinutes: 100,
  };
  assert.equal(classifySeries(seasons, [completed(1), partial], NOW), 'watching');
  assert.deepEqual(summarizeSeriesCompletion(seasons, [completed(1), partial], NOW), {
    completedSeasons: 1,
    releasedSeasons: 2,
    percentage: 50,
    hasCompletedSeason: true,
    isFullyCompleted: false,
  });
});

test('série sem temporada concluída não entra no progresso de finalizadas', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2026-07-01' },
  ];
  const partial = {
    ...completed(1),
    watchedEpisodeNumbers: [1, 2],
    completedAt: null,
    watchedDurationMinutes: 100,
  };

  assert.deepEqual(summarizeSeriesCompletion(seasons, [partial], NOW), {
    completedSeasons: 0,
    releasedSeasons: 1,
    percentage: 0,
    hasCompletedSeason: false,
    isFullyCompleted: false,
  });
});

test('temporada sem data e sem consumo não reabre série concluída', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: null },
  ];
  assert.equal(classifySeries(seasons, [completed(1)], NOW), 'finished');
});

test('episódios assistidos provam que temporada sem data já foi lançada', () => {
  const state = seasonState(
    { seasonNumber: 2, episodeCount: 8, airDate: null },
    { watchedEpisodeNumbers: [1], episodeCount: 8 },
    NOW,
  );
  assert.equal(state, 'watching');
});

test('completedAt preserva conclusão mesmo quando o catálogo muda a contagem', () => {
  const record = {
    ...completed(1),
    watchedEpisodeNumbers: [1, 2],
    episodeCount: 2,
  };
  const seasons = [{ seasonNumber: 1, episodeCount: 10, airDate: '2023-01-01' }];

  assert.equal(seasonState(seasons[0], record, NOW), 'completed');
  assert.equal(classifySeries(seasons, [record], NOW), 'finished');
});

test('merge é idempotente, deduplica episódios e preserva conclusão mais avançada', () => {
  const first = mergeSeasonProgress(completed(1), {
    uid: 'u1',
    seriesId: 100,
    seasonNumber: 1,
    watchedEpisodeNumbers: [8, 8, 7],
    episodeCount: 8,
    completedAt: null,
    updatedAt: '2026-07-02T00:00:00.000Z',
    source: 'migration',
  });
  const second = mergeSeasonProgress(first, first);
  assert.deepEqual(first.watchedEpisodeNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(first.completedAt, '2026-07-01T12:00:00.000Z');
  assert.deepEqual(second.watchedEpisodeNumbers, first.watchedEpisodeNumbers);
  assert.equal(seasonProgressId(100, 1), '100_s1');
});

test('migração legada cria um registro por temporada sem duplicatas', () => {
  const records = legacyHistoryToSeasonProgress('u1', {
    100: { 1: [3, 1, 1, 2], 2: [1] },
  }, '2026-07-30T00:00:00.000Z');
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].watchedEpisodeNumbers, [1, 2, 3]);
  assert.deepEqual(uniqueEpisodeNumbers([2, 2, 1, 0, '3']), [1, 2, 3]);
});

// Merge canonical season records with legacy per-episode history the same way
// the Séries page and stats do, so imported watches count toward completion.
const mergeCanonicalAndLegacy = (canonical, legacy) => {
  const bySeason = new Map(canonical.map((record) => [record.seasonNumber, record]));
  legacy.forEach((record) => {
    const existing = bySeason.get(record.seasonNumber);
    bySeason.set(record.seasonNumber, existing ? mergeSeasonProgress(existing, record) : record);
  });
  return Array.from(bySeason.values());
};

test('série de temporada única importada (só no histórico legado) é finalizada', () => {
  // TV Time imports write watched episodes only to the legacy per-episode store.
  const seasons = [{ seasonNumber: 1, episodeCount: 6, airDate: '2026-04-28' }];
  const legacy = legacyHistoryToSeasonProgress('u1', { 257994: { 1: [1, 2, 3, 4, 5, 6] } });
  assert.equal(classifySeries(seasons, legacy, NOW), 'finished');
});

test('temporadas importadas mesclam com o progresso canônico e finalizam a série', () => {
  // Only the last season lives in canonical progress; the rest came from import.
  const seasons = [1, 2, 3, 4].map((seasonNumber) => ({
    seasonNumber, episodeCount: 10, airDate: `202${seasonNumber + 1}-01-01`,
  }));
  const canonical = [completed(4, 10)];
  const legacy = legacyHistoryToSeasonProgress('u1', {
    124364: {
      1: Array.from({ length: 10 }, (_, index) => index + 1),
      2: Array.from({ length: 10 }, (_, index) => index + 1),
      3: Array.from({ length: 10 }, (_, index) => index + 1),
    },
  });
  const merged = mergeCanonicalAndLegacy(canonical, legacy);
  assert.equal(classifySeries(seasons, merged, NOW), 'finished');
});

test('horas são separadas entre temporadas concluídas e em andamento', () => {
  const partial = {
    ...completed(2),
    watchedEpisodeNumbers: [1, 2],
    episodeDurations: { 1: 42, 2: 48 },
    watchedDurationMinutes: 90,
    completedAt: null,
  };
  const split = splitSeasonMinutes([completed(1), partial]);
  assert.deepEqual(split, { completed: 400, watching: 90, total: 490 });
});

test('temporada futura não altera as horas já concluídas', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2026-10-01' },
  ];
  const records = [completed(1)];

  assert.equal(classifySeries(seasons, records, NOW), 'finished');
  assert.deepEqual(splitSeasonMinutes(records), {
    completed: 400,
    watching: 0,
    total: 400,
  });
});

test('temporada recém-lançada sem progresso reabre a série sem duplicar horas', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2026-07-29' },
  ];
  const records = [completed(1)];

  assert.equal(classifySeries(seasons, records, NOW), 'watching');
  assert.deepEqual(splitSeasonMinutes(records), {
    completed: 400,
    watching: 0,
    total: 400,
  });
});

test('temporada nova parcialmente assistida separa horas sem contar a série duas vezes', () => {
  const seasons = [
    { seasonNumber: 1, episodeCount: 8, airDate: '2023-01-01' },
    { seasonNumber: 2, episodeCount: 8, airDate: '2026-07-29' },
  ];
  const partial = {
    ...completed(2),
    watchedEpisodeNumbers: [1, 2],
    episodeDurations: { 1: 42, 2: 48 },
    watchedDurationMinutes: 90,
    completedAt: null,
  };
  const records = [completed(1), partial];

  assert.equal(classifySeries(seasons, records, NOW), 'watching');
  assert.deepEqual(splitSeasonMinutes(records), {
    completed: 400,
    watching: 90,
    total: 490,
  });
});

test('duração usa runtimes por episódio e fallback apenas quando necessário', () => {
  assert.equal(calculateWatchedDuration([1, 2, 3], { 1: 40, 3: 60 }, 50), 150);
});
