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

test('every Solar fallback has a native SF Symbols equivalent', async () => {
  const iconSource = await readProjectFile('src/components/Icon.tsx');

  assert.deepEqual(objectKeys(iconSource, 'SF_SYMBOLS'), objectKeys(iconSource, 'ICONS'));
  assert.match(iconSource, /registerPlugin<SFSymbolsNativePlugin>\('SFSymbols'\)/);
  assert.match(iconSource, /Capacitor\.getPlatform\(\) === 'ios'/);
  assert.match(iconSource, /<SolarIcon/);
  assert.match(iconSource, /name === 'plusPlain'/);
  assert.match(iconSource, /M13 13v7a1 1 0 0 1-2 0v-7H4/);
  assert.match(iconSource, /\? 'Bold' : 'Outline'/);
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
