import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tabBar = await readFile(
  new URL('../src/components/TabBar.tsx', import.meta.url),
  'utf8',
);
const frame = await readFile(
  new URL('../src/components/Frame.tsx', import.meta.url),
  'utf8',
);
const appDelegate = await readFile(
  new URL('../ios/App/App/AppDelegate.swift', import.meta.url),
  'utf8',
);
const globals = await readFile(
  new URL('../src/app/globals.css', import.meta.url),
  'utf8',
);
const primitives = await readFile(
  new URL('../src/components/primitives.tsx', import.meta.url),
  'utf8',
);
const titleDetail = await readFile(
  new URL('../src/app/title/[type]/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('web and Android retain the shared fallback toolbar', () => {
  assert.match(tabBar, /className="tb-pill"/);
  assert.match(tabBar, /data-platform="android"/);
  assert.match(tabBar, /prefers-reduced-transparency/);
});

test('Capacitor iOS uses a real UIKit tab bar and route bridge', () => {
  assert.match(appDelegate, /UITabBarDelegate/);
  assert.match(appDelegate, /UITabBarAppearance/);
  assert.match(appDelegate, /maratonouNativeChrome/);
  assert.match(frame, /maratonou:native-tab-select/);
  assert.match(globals, /html\[data-native-chrome="true"\] \.tab-bar-wrap/);
});

test('native appearance delegates Liquid Glass to iOS 26', () => {
  assert.match(appDelegate, /#unavailable\(iOS 26\.0\)/);
  assert.match(appDelegate, /systemUltraThinMaterial/);
  assert.match(appDelegate, /isReduceTransparencyEnabled/);
});

test('native chrome owns themed active toolbar colors', () => {
  assert.match(appDelegate, /selectedColor: UIColor = nativeChromeIsDark \? \.white : \.black/);
});

test('only the bottom toolbar is native on iOS', () => {
  assert.match(appDelegate, /NativeTabHome/);
  assert.match(appDelegate, /NativeTabSeries/);
  assert.match(appDelegate, /NativeTabSearch/);
  assert.doesNotMatch(appDelegate, /NativeHeaderActionView/);
  assert.doesNotMatch(appDelegate, /controlsCommitted/);
  assert.doesNotMatch(appDelegate, /data-maratonou-icon-id/);
  assert.doesNotMatch(globals, /data-native-control-ready/);
});

test('web header buttons remain visible and are not mirrored by UIKit', () => {
  assert.doesNotMatch(appDelegate, /native-controls/);
  assert.doesNotMatch(appDelegate, /headerControls/);
  assert.doesNotMatch(globals, /data-native-controls/);
  assert.match(globals, /\.ios-top-action/);
});

test('web disables duplicated header controls left by older installed iOS builds', () => {
  assert.match(frame, /dataset\.nativeControls === 'true'/);
  assert.match(frame, /removeAttribute\('data-maratonou-icon-id'\)/);
  assert.match(frame, /type: 'controls'/);
  assert.match(frame, /controls: \[\]/);
  assert.match(frame, /delete document\.documentElement\.dataset\.nativeControls/);
});

test('web action sheets are preserved and temporarily hide the native toolbar', () => {
  assert.doesNotMatch(appDelegate, /UIAlertController/);
  assert.doesNotMatch(appDelegate, /NativeActionSheetViewController/);
  assert.doesNotMatch(primitives, /nativeActionSheet/);
  assert.match(primitives, /createPortal/);
  assert.match(primitives, /dataset\.modalOpen = 'true'/);
  assert.match(appDelegate, /case "modal"/);
  assert.match(appDelegate, /!nativeModalIsVisible/);
  assert.match(appDelegate, /MutationObserver\(syncModal\)/);
});

test('native toolbar honors system accessibility preferences', () => {
  assert.match(appDelegate, /isReduceMotionEnabled/);
  assert.match(appDelegate, /reduceTransparencyStatusDidChangeNotification/);
  assert.match(frame, /type: 'theme'/);
});

test('sticky headers share the native 44pt navigation row', () => {
  assert.match(globals, /--app-sticky-header-row-height:\s*44px/);
  assert.match(globals, /--app-sticky-header-center-offset:\s*22px/);
  assert.match(primitives, /var\(--app-sticky-header-row-height\)/);
  assert.match(titleDetail, /var\(--app-sticky-header-center-offset\)/);
  assert.doesNotMatch(titleDetail, /safe-area-top\) \+ 32px/);
});
