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
