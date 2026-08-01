import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const spritePath = path.join(root, 'public/icons/streamline-flex-solid.svg');
const assetsRoot = path.join(root, 'ios/App/App/Assets.xcassets');

const icons = {
  NativeTabHome: 'home-2-solid',
  NativeTabSeries: 'icon-park-solid-play',
  NativeTabSearch: 'magnifying-glass-solid',
  NativeTabMovies: 'film-slate-solid',
  NativeTabActivity: 'uis-comment-dots',
  NativeTabProfile: 'user-circle-single-solid',
};

const sprite = await fs.readFile(spritePath, 'utf8');

function symbolSource(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sprite.match(new RegExp(`<symbol\\b([^>]*)\\bid="${escaped}"([^>]*)>([\\s\\S]*?)<\\/symbol>`));
  if (!match) throw new Error(`Ícone ausente no sprite: ${id}`);
  const attrs = `${match[1]} ${match[2]}`;
  const viewBox = attrs.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 14 14';
  const body = match[3].replaceAll('currentColor', '#000000');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#000000" color="#000000">${body}</svg>`,
  );
}

for (const [assetName, symbolId] of Object.entries(icons)) {
  const imageSet = path.join(assetsRoot, `${assetName}.imageset`);
  await fs.mkdir(imageSet, { recursive: true });
  const source = symbolSource(symbolId);

  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    await sharp(source)
      .resize(24 * scale, 24 * scale, { fit: 'contain' })
      .png()
      .toFile(path.join(imageSet, `${assetName}${suffix}.png`));
  }

  await fs.writeFile(
    path.join(imageSet, 'Contents.json'),
    `${JSON.stringify({
      images: [1, 2, 3].map((scale) => ({
        filename: `${assetName}${scale === 1 ? '' : `@${scale}x`}.png`,
        idiom: 'universal',
        scale: `${scale}x`,
      })),
      info: { author: 'xcode', version: 1 },
      properties: { 'template-rendering-intent': 'template' },
    }, null, 2)}\n`,
  );
}

console.log(`Gerados ${Object.keys(icons).length} ícones nativos a partir do sprite original.`);
