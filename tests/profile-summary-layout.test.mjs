import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('profile statistics and streaming summaries use stacked full-width rows', async () => {
  const source = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  assert.match(source, /display: 'flex', flexDirection: 'column', gap: 12/);
  assert.equal((source.match(/width: '100%', background: 'linear-gradient\(145deg/g) ?? []).length, 2);
  assert.match(source, /activeSubs\.slice\(0, 5\)/);
  assert.match(source, /flexWrap: 'nowrap'/);
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
  assert.match(source, /maxPlatformPrice/);
  assert.match(source, /data-streaming-chart="compact"/);
  assert.match(source, /value \/ maxPlatformPrice/);
});
