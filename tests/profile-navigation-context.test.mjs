import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

test('profile-origin pages keep the profile tab active', async () => {
  const [tabBar, frame, profilePage, settingsPage] = await Promise.all([
    readFile(new URL('src/components/TabBar.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/components/Frame.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8'),
    readFile(new URL('src/app/settings/page.tsx', projectRoot), 'utf8'),
  ]);

  assert.match(tabBar, /searchParams\.get\('from'\) === 'profile'/);
  assert.match(tabBar, /fromProfile \|\| pathname\?\.startsWith\('\/settings'\) \? 'profile'/);
  assert.match(frame, /const showTabs = fromProfile \|\| TAB_PATHS/);
  assert.match(profilePage, /withProfileOrigin\('\/lists'\)/);
  assert.match(profilePage, /withProfileOrigin\('\/stats'\)/);
  assert.match(profilePage, /withProfileOrigin\('\/expenses'\)/);
  assert.match(settingsPage, /vip\.accountStats'\),\s+onClick: \(\) => router\.push\(withProfileOrigin\('\/stats'\)\)/);
  assert.doesNotMatch(settingsPage, /vip\.accountStats'[\s\S]{0,120}myProfileUrl/);
});

test('the profile summary stat cards link to stats, ratings and ranking (owner only)', async () => {
  const profilePage = await readFile(new URL('src/app/user/[username]/page.tsx', projectRoot), 'utf8');

  // Each card carries its own route; ratings only exists on the owner's profile
  // and hours/ranking navigate only when it's the owner (these pages show the
  // signed-in user's own data).
  assert.match(profilePage, /icon: 'clock' as const, href: isMe \? '\/stats' : null/);
  assert.match(profilePage, /icon: 'star' as const, href: '\/ratings'/);
  assert.match(profilePage, /icon: 'award' as const, href: isMe \? '\/ranking' : null/);
  // A card with a route renders as a button that navigates; otherwise a static div.
  assert.match(profilePage, /onClick=\{\(\) => router\.push\(withProfileOrigin\(href\)\)\}/);
  assert.match(profilePage, /: <div key=\{label\} style=\{boxStyle\}>\{inner\}<\/div>/);
});
