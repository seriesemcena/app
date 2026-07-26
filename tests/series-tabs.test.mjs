import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('series tabs follow the watching, behind and finished order', async () => {
  const source = await readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8');

  assert.match(source, /type SeriesTab = 'maratonando' \| 'atrasadas' \| 'finalizadas'/);
  assert.match(source, /useState<SeriesTab>\('maratonando'\)/);
  assert.match(source, /\(\['maratonando', 'atrasadas', 'finalizadas'\] as const\)\.map/);
});

test('watching reuses the upcoming-series content and finished uses watched titles', async () => {
  const source = await readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8');

  assert.match(source, /tab === 'maratonando'[\s\S]*?emBreveGroups\.map/);
  assert.match(source, /tab === 'atrasadas'[\s\S]*?atrasadas\.map/);
  assert.match(source, /tab === 'finalizadas'[\s\S]*?items=\{watchedList as unknown as TMDBItem\[\]\}/);
});

test('today episode cards use the animated gradient border with reduced-motion support', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('src/app/series/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/globals.css', projectRoot), 'utf8'),
  ]);

  assert.match(page, /className=\{groupDate\.isToday \? 'series-episode-card-today' : undefined\}/);
  assert.match(styles, /@keyframes seriesEpisodeTodayBorder/);
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
  assert.match(page, /epWatchedStore\.getShow\(item\.id\)\[String\(seasonNumber\)\]/);
  assert.match(page, /overdueEpisodes\(season\?\.episodes \|\| \[\], watched\)/);
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
    [pt.tabs.maratonando, pt.tabs.atrasadas, pt.tabs.finalizadas],
    ['Maratonando', 'Atrasadas', 'Finalizadas'],
  );
  assert.deepEqual(
    [en.tabs.maratonando, en.tabs.atrasadas, en.tabs.finalizadas],
    ['Watching', 'Behind', 'Finished'],
  );
  assert.deepEqual(
    [es.tabs.maratonando, es.tabs.atrasadas, es.tabs.finalizadas],
    ['Viendo', 'Atrasadas', 'Terminadas'],
  );
  assert.match(pt.behindDetail, /72 horas/);
  assert.match(en.behindDetail, /72 hours/);
  assert.match(es.behindDetail, /72 horas/);
  assert.equal(pt.seasonNumber, 'Temporada {{number}}');
  assert.equal(en.seasonNumber, 'Season {{number}}');
  assert.equal(es.seasonNumber, 'Temporada {{number}}');
});
