import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = resolve(root, 'public/Logo Maratonou SVG.svg');
const iconDir = resolve(root, 'public/icons');
const iosIconPath = resolve(
  root,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
);
const androidRes = resolve(root, 'android/app/src/main/res');
const background = '#0D0D0F';

const logoSvg = await readFile(logoPath, 'utf8');
const logoBody = logoSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();

function iconSvg({
  size,
  logoRatio,
  shape = 'square',
}) {
  const logoWidth = size * logoRatio;
  const scale = logoWidth / 947;
  const logoHeight = 548 * scale;
  const x = (size - logoWidth) / 2;
  const y = (size - logoHeight) / 2;
  const backgroundShape = shape === 'transparent'
    ? ''
    : shape === 'round'
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${background}"/>`
      : `<rect width="${size}" height="${size}"${shape === 'rounded' ? ` rx="${size * 0.21}"` : ''} fill="${background}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    backgroundShape,
    `<g transform="translate(${x} ${y}) scale(${scale})">`,
    logoBody,
    '</g>',
    '</svg>',
  ].join('\n');
}

async function renderPng(svg, outputPath, size, rgb = false) {
  await mkdir(dirname(outputPath), { recursive: true });
  let image = sharp(Buffer.from(svg)).resize(size, size);
  if (rgb) image = image.flatten({ background });
  await image.png().toFile(outputPath);
}

const iconSource = iconSvg({ size: 512, logoRatio: 0.68, shape: 'rounded' });
const maskableSource = iconSvg({ size: 512, logoRatio: 0.58 });

await writeFile(resolve(iconDir, 'icon-source.svg'), `${iconSource}\n`);
await writeFile(resolve(iconDir, 'icon-maskable-source.svg'), `${maskableSource}\n`);

await Promise.all([
  renderPng(iconSource, resolve(iconDir, 'apple-touch-icon.png'), 180),
  renderPng(iconSource, resolve(iconDir, 'icon-192.png'), 192),
  renderPng(iconSource, resolve(iconDir, 'icon-512.png'), 512),
  renderPng(maskableSource, resolve(iconDir, 'icon-maskable-512.png'), 512),
  renderPng(iconSvg({ size: 1024, logoRatio: 0.68 }), iosIconPath, 1024, true),
]);

const androidDensities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

await Promise.all(androidDensities.flatMap(([density, legacySize, foregroundSize]) => {
  const mipmapDir = resolve(androidRes, `mipmap-${density}`);
  return [
    renderPng(
      iconSvg({ size: legacySize, logoRatio: 0.68 }),
      resolve(mipmapDir, 'ic_launcher.png'),
      legacySize,
    ),
    renderPng(
      iconSvg({ size: legacySize, logoRatio: 0.68, shape: 'round' }),
      resolve(mipmapDir, 'ic_launcher_round.png'),
      legacySize,
    ),
    renderPng(
      iconSvg({ size: foregroundSize, logoRatio: 0.58, shape: 'transparent' }),
      resolve(mipmapDir, 'ic_launcher_foreground.png'),
      foregroundSize,
    ),
  ];
}));

console.log('Generated Maratonou PWA, iOS and Android app icons.');
