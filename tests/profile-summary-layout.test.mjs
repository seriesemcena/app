import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('profile statistics and streaming summaries use stacked full-width rows', async () => {
  const source = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  assert.match(source, /display: 'flex', flexDirection: 'column', gap: 12/);
  assert.equal((source.match(/width: '100%', background: 'linear-gradient\(145deg/g) ?? []).length, 2);
  assert.match(source, /activeSubs\.slice\(0, 5\)/);
  assert.match(source, /data-streaming-logos/);
  assert.match(source, /justifyContent: 'flex-start', gap: 4/);
  assert.equal((source.match(/data-summary-layout="stacked"/g) ?? []).length, 2);
});

test('profile streaming summary uses the official local logos', async () => {
  const source = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  assert.match(source, /const STREAMING_LOGOS:/);
  assert.match(source, /STREAMING_LOGOS\[p\.streamId \?\? ''\] \?\? STREAMING_LOGOS_BY_NAME\[p\.name\]/);
  assert.match(source, /src=\{`\/\$\{logo\}_logo\.png`\}/);
});

test('profile summary uses real watch activity and compact streaming tracks', async () => {
  const source = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  assert.match(source, /dbUserStatsStore\.get\(getDB\(\), user\.uid\)/);
  assert.match(source, /buildWatchCalendar\(dates\)/);
  assert.match(source, /gridTemplateColumns: 'repeat\(7, minmax\(0, 1fr\)\)'/);
  assert.match(source, /data-streaming-chart="compact"/);
  assert.match(source, /data-streaming-track/);
  assert.match(source, /width: `\$\{84 \/ userPlatforms\.length\}%`/);
  assert.doesNotMatch(source, /priceFormatter\.format\(totalMonthly\)/);
});

test('profile social counters open the dedicated connections page instead of a popup', async () => {
  const source = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  assert.match(source, /\/followers\?tab=following/);
  assert.match(source, /\/followers\?tab=followers/);
  assert.doesNotMatch(source, /setSocialSheet|socialSheet|Bottom sheet: seguidores/);
});

test('connections page supports both social tabs, pagination and profile navigation', async () => {
  const source = await readFile(new URL('src/app/user/[username]/followers/page.tsx', projectRoot), 'utf8');

  assert.match(source, /type SocialTab = 'followers' \| 'following'/);
  assert.match(source, /getFollowRelationsPage\(getDB\(\), profileUid, tab/);
  assert.match(source, /getFollowers\(getDB\(\), identities, profileUid\)/);
  assert.match(source, /dbFollowStore\.get\(getDB\(\), profileUid\)/);
  assert.match(source, /\/followers\?tab=\$\{nextTab\}/);
  assert.match(source, /router\.push\(`\/user\/\$\{encodeURIComponent\(person\.username\)\}`\)/);
  assert.match(source, /hasMore &&/);
});

test('connections page copy is translated in every supported locale', async () => {
  const localeNames = ['pt-BR', 'en-US', 'es-ES'];

  for (const locale of localeNames) {
    const copy = JSON.parse(await readFile(new URL(`src/locales/${locale}/profile.json`, projectRoot), 'utf8'));
    assert.equal(typeof copy.connectionsTitle, 'string');
    assert.equal(typeof copy.loadMoreSocial, 'string');
    assert.equal(typeof copy.loadingSocial, 'string');
  }
});
