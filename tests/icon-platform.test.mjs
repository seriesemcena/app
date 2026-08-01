import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), 'utf8');
}

test('every platform keeps the original Maratonou SVG icon language', async () => {
  const [iconSource, spriteSource, packageJson, generatorSource] = await Promise.all([
    readProjectFile('src/components/Icon.tsx'),
    readProjectFile('public/icons/streamline-flex-solid.svg'),
    readProjectFile('package.json'),
    readProjectFile('scripts/generate-ios-native-icons.mjs'),
  ]);

  assert.match(iconSource, /streamline-flex-solid\.svg#\$\{iconId\}/);
  assert.match(iconSource, /data-maratonou-icon-name=\{name\}/);
  assert.match(iconSource, /data-maratonou-icon-id=\{iconId\}/);
  assert.doesNotMatch(iconSource, /registerPlugin/);
  assert.doesNotMatch(iconSource, /systemName/);
  assert.match(spriteSource, /Streamline Flex solid icons by Streamline \(CC BY 4\.0\)/);
  assert.match(spriteSource, /id="home-2-solid"/);
  assert.match(spriteSource, /id="fa7-solid-check-circle"/);
  assert.match(spriteSource, /id="fa7-solid-bell"/);
  assert.match(spriteSource, /id="film-slate-solid"/);
  assert.match(spriteSource, /id="uis-comment-dots"/);
  assert.match(spriteSource, /id="ep-close-bold"/);
  assert.match(spriteSource, /id="icon-park-solid-play"/);
  assert.match(spriteSource, /id="playlist-solid"/);
  assert.match(spriteSource, /id="uil-star"/);
  assert.match(spriteSource, /id="uim-star"/);
  assert.match(spriteSource, /id="control-plus"/);
  assert.match(iconSource, /star: 'uim-star'/);
  assert.match(iconSource, /starO: 'uil-star'/);
  assert.match(iconSource, /check: 'fa7-solid-check-circle'/);
  assert.match(iconSource, /bell: 'fa7-solid-bell'/);
  assert.match(iconSource, /film: 'film-slate-solid'/);
  assert.match(iconSource, /tv: 'icon-park-solid-play'/);
  assert.match(iconSource, /message: 'uis-comment-dots'/);
  assert.match(iconSource, /close: 'ep-close-bold'/);
  assert.match(iconSource, /playlist: 'playlist-solid'/);
  assert.match(generatorSource, /streamline-flex-solid\.svg/);
  assert.match(generatorSource, /NativeTabHome: 'home-2-solid'/);
  assert.match(generatorSource, /NativeTabSeries: 'icon-park-solid-play'/);
  assert.match(generatorSource, /NativeTabMovies: 'film-slate-solid'/);
  assert.match(generatorSource, /NativeTabActivity: 'uis-comment-dots'/);
  assert.match(generatorSource, /template-rendering-intent/);
  assert.match(packageJson, /"icons:ios-native": "node scripts\/generate-ios-native-icons\.mjs"/);
  assert.match(packageJson, /"@iconify-json\/streamline-flex"/);
  assert.doesNotMatch(packageJson, /"@solar-icons\/react"/);
});

test('the iOS bridge renders original app artwork without an SF Symbols plugin', async () => {
  const [swiftSource, storyboard] = await Promise.all([
    readProjectFile('ios/App/App/AppDelegate.swift'),
    readProjectFile('ios/App/App/Base.lproj/Main.storyboard'),
  ]);

  assert.match(swiftSource, /UIImage\(named: imageName\)/);
  assert.match(swiftSource, /originalIconPNG/);
  assert.match(swiftSource, /streamline-flex-solid\.svg/);
  assert.match(swiftSource, /data-maratonou-icon-id/);
  assert.doesNotMatch(swiftSource, /SFSymbolsPlugin/);
  assert.doesNotMatch(swiftSource, /UIImage\(systemName:/);
  assert.match(storyboard, /customClass="MaratonouBridgeViewController"/);
});
