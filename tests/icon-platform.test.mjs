import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), 'utf8');
}

function objectKeys(source, constantName) {
  const object = source.match(new RegExp(`const ${constantName}[^=]*= \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(object, `${constantName} should exist`);
  return [...object[1].matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)]
    .map((match) => match[1])
    .sort();
}

test('every Streamline Flex fallback has a native SF Symbols equivalent', async () => {
  const [iconSource, spriteSource, packageJson] = await Promise.all([
    readProjectFile('src/components/Icon.tsx'),
    readProjectFile('public/icons/streamline-flex-solid.svg'),
    readProjectFile('package.json'),
  ]);

  assert.deepEqual(objectKeys(iconSource, 'SF_SYMBOLS'), objectKeys(iconSource, 'ICONS'));
  assert.match(iconSource, /registerPlugin<SFSymbolsNativePlugin>\('SFSymbols'\)/);
  assert.match(iconSource, /Capacitor\.getPlatform\(\) === 'ios'/);
  assert.match(iconSource, /streamline-flex-solid\.svg#\$\{iconId\}/);
  assert.match(spriteSource, /Streamline Flex solid icons by Streamline \(CC BY 4\.0\)/);
  assert.match(spriteSource, /id="home-2-solid"/);
  assert.match(spriteSource, /id="fa7-solid-check-circle"/);
  assert.match(spriteSource, /id="fa7-solid-bell"/);
  assert.match(spriteSource, /id="film-slate-solid"/);
  assert.match(spriteSource, /id="uis-comment-dots"/);
  assert.match(spriteSource, /id="icon-park-solid-play"/);
  assert.match(spriteSource, /id="playlist-solid"/);
  assert.match(spriteSource, /id="control-plus"/);
  assert.match(iconSource, /check: 'fa7-solid-check-circle'/);
  assert.match(iconSource, /bell: 'fa7-solid-bell'/);
  assert.match(iconSource, /film: 'film-slate-solid'/);
  assert.match(iconSource, /tv: 'icon-park-solid-play'/);
  assert.match(iconSource, /message: 'uis-comment-dots'/);
  assert.match(iconSource, /playlist: 'playlist-solid'/);
  assert.match(iconSource, /SVG_ICON_OVERRIDES = new Set<IconName>\(\['check', 'bell', 'film', 'tv', 'message', 'playlist'\]\)/);
  assert.match(iconSource, /!nativeIOS \|\| SVG_ICON_OVERRIDES\.has\(name\)/);
  assert.match(packageJson, /"@iconify-json\/streamline-flex"/);
  assert.doesNotMatch(packageJson, /"@solar-icons\/react"/);
});

test('the iOS bridge registers the native SF Symbols plugin', async () => {
  const [swiftSource, storyboard] = await Promise.all([
    readProjectFile('ios/App/App/AppDelegate.swift'),
    readProjectFile('ios/App/App/Base.lproj/Main.storyboard'),
  ]);

  assert.match(swiftSource, /public let jsName = "SFSymbols"/);
  assert.match(swiftSource, /UIImage\(systemName: symbolName/);
  assert.match(swiftSource, /registerPluginInstance\(SFSymbolsPlugin\(\)\)/);
  assert.match(storyboard, /customClass="MaratonouBridgeViewController"/);
});
