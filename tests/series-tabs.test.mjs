import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('series tabs separate season progress from fully finished shows', async () => {
  const source = await readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8');

  assert.match(source, /type SeriesTab = 'maratonando' \| 'atrasadas' \| 'emProgresso' \| 'finalizadas'/);
  assert.match(source, /useState<SeriesTab>\('maratonando'\)/);
  assert.match(source, /\(\['maratonando', 'atrasadas', 'emProgresso', 'finalizadas'\] as const\)\.map/);
});

test('watching and finished tabs use the season-aware reconciled collections', async () => {
  const source = await readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8');

  assert.match(source, /tab === 'maratonando'[\s\S]*?emBreveGroups\.map/);
  assert.match(source, /tab === 'atrasadas'[\s\S]*?atrasadas\.map/);
  assert.match(source, /classifySeries\(catalog, progress\)/);
  assert.match(source, /summarizeSeriesCompletion\(catalog, progress\)/);
  assert.match(source, /seasonProgressStore\.getAll\(\)\.forEach/);
  assert.match(source, /setFinishedList\(loaded[\s\S]*?classification === 'finished' \|\| item\.hasCompletedSeason/);
  assert.match(source, /items\.filter\(\(item\) => !item\.hasCompletedSeason\)/);
  assert.match(source, /tab === 'emProgresso'[\s\S]*?finishedInProgress\.map/);
  assert.match(source, /tab === 'finalizadas'[\s\S]*?items=\{fullyFinished as unknown as TMDBItem\[\]\}/);
  assert.doesNotMatch(
    source.match(/\{\/\* ══ TAB: Finalizadas ══ \*\/\}([\s\S]*?)<div style=\{\{ height: 24 \}\}/)?.[1] || '',
    /finishedInProgress\.map/,
  );
  assert.match(source, /t\('inProgress'\)/);
  assert.match(source, /t\('seasonsCompleted'/);
  assert.match(
    source,
    /t\('season', \{ number: item\.nextSeason, ns: 'title' \}\)\} · \{t\('episode', \{ number: item\.nextEpisode, ns: 'title' \}\)/,
  );
  assert.doesNotMatch(source, /`T\$\{item\.nextSeason\} · Ep \$\{item\.nextEpisode\}`/);
});

test('today episode cards use the animated gradient border with reduced-motion support', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/globals.css', projectRoot), 'utf8'),
  ]);

  assert.match(page, /className=\{groupDate\.isToday \? 'series-episode-card-today' : undefined\}/);
  assert.match(styles, /@keyframes seriesEpisodeTodayBorder/);
  assert.match(styles, /\.series-episode-card-today[\s\S]*?linear-gradient\(var\(--c-surface\), var\(--c-surface\)\)/);
  assert.match(styles, /\.series-episode-card-today[\s\S]*?linear-gradient\(\s*110deg/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*?\.series-episode-card-today/);
});

test('behind tab checks current-season episode history after the 72-hour window', async () => {
  const [page, schedule] = await Promise.all([
    readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/lib/seriesSchedule.ts', projectRoot), 'utf8'),
  ]);

  assert.match(schedule, /OVERDUE_EPISODE_WINDOW_MS = 72 \* 60 \* 60 \* 1000/);
  assert.match(schedule, /last_episode_to_air\?\.season_number/);
  assert.match(schedule, /airDate \+ OVERDUE_EPISODE_WINDOW_MS <= now/);
  assert.match(schedule, /watched\.has\(episodeNumber\)/);
  assert.match(page, /const season = await tmdb\.season\(item\.id, seasonNumber\)/);
  assert.match(page, /progress\.find\(\(record\) => record\.seasonNumber === seasonNumber\)/);
  assert.match(page, /epWatchedStore\.getShow\(item\.id\)\[String\(seasonNumber\)\]/);
  assert.match(page, /overdueEpisodes\(season\?\.episodes \|\| \[\], watchedEpisodes\)/);
  assert.match(page, /items\.filter\(\(item\) => \(item\.overdueCount \?\? 0\) > 0\)/);
});

test('behind cards share the watching card dimensions and side-image layout', async () => {
  const source = await readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8');
  const behindSection = source.match(/\{\/\* ══ TAB: Atrasadas ══ \*\/\}([\s\S]*?)\{\/\* ══ TAB: Finalizadas ══ \*\/\}/)?.[1] || '';

  assert.match(behindSection, /minHeight: 112[\s\S]*?alignItems: 'stretch'[\s\S]*?overflow: 'hidden'/);
  assert.match(behindSection, /width: 148, minHeight: 112[\s\S]*?position: 'relative'[\s\S]*?objectFit: 'cover'/);
  assert.match(behindSection, /position: 'absolute', left: 10, bottom: 10[\s\S]*?tags\.atrasado/);
  assert.match(behindSection, /padding: '12px 16px 12px 0'/);
  assert.match(behindSection, /t\('seasonNumber', \{ number: item\.overdueSeason \}\)/);
  assert.match(behindSection, /name="clock" size=\{13\}[\s\S]*?size=\{12\} weight=\{700\}[\s\S]*?overdueEpisodes/);
  assert.doesNotMatch(behindSection, /name="chevronR"/);
});

test('series tab labels are localized in the supported app languages', async () => {
  const localePaths = [
    'src/locales/pt-BR/home.json',
    'src/locales/en-US/home.json',
    'src/locales/es-ES/home.json',
  ];
  const [pt, en, es] = await Promise.all(
    localePaths.map(async (path) => JSON.parse(await readFile(new URL(path, projectRoot), 'utf8'))),
  );

  assert.deepEqual(
    [pt.tabs.maratonando, pt.tabs.atrasadas, pt.tabs.emProgresso, pt.tabs.finalizadas],
    ['Maratonando', 'Atrasadas', 'Em progresso', 'Finalizadas'],
  );
  assert.deepEqual(
    [en.tabs.maratonando, en.tabs.atrasadas, en.tabs.emProgresso, en.tabs.finalizadas],
    ['Watching', 'Behind', 'In progress', 'Finished'],
  );
  assert.deepEqual(
    [es.tabs.maratonando, es.tabs.atrasadas, es.tabs.emProgresso, es.tabs.finalizadas],
    ['Viendo', 'Atrasadas', 'En progreso', 'Terminadas'],
  );
  assert.match(pt.behindDetail, /72 horas/);
  assert.match(en.behindDetail, /72 hours/);
  assert.match(es.behindDetail, /72 horas/);
  assert.equal(pt.seasonNumber, 'Temporada {{number}}');
  assert.equal(en.seasonNumber, 'Season {{number}}');
  assert.equal(es.seasonNumber, 'Temporada {{number}}');
});
