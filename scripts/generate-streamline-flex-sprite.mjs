import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'node_modules/@iconify-json/streamline-flex/icons.json');
const outputPath = resolve(root, 'public/icons/streamline-flex-solid.svg');

const iconSet = JSON.parse(await readFile(sourcePath, 'utf8'));
const iconNames = [
  'home-2-solid',
  'magnifying-glass-solid',
  'blank-calendar-solid',
  'play-list-6-solid',
  'user-circle-single-solid',
  'star-circle-solid',
  'heart-solid',
  'play-list-4-solid',
  'check-square-solid',
  'application-add-solid',
  'navigation-arrow-north-solid',
  'bell-solid',
  'cog-solid',
  'film-solid',
  'screen-curve-solid',
  'crown-solid',
  'information-circle-solid',
  'share-link-solid',
  'campfire-solid',
  'location-pin-3-solid',
  'router-wifi-network-solid',
  'padlock-square-1-solid',
  'happy-face-solid',
  'chat-bubble-text-square-solid',
  'triangle-flag-solid',
  'graph-bar-increase-square-solid',
  'bookmark-solid',
  'trophy-solid',
  'stopwatch-solid',
  'dark-dislay-mode-solid',
  'logout-1-solid',
  'discussion-converstion-reply-solid',
  'pencil-square-solid',
  'recycle-bin-solid',
  'magic-wand-1-solid',
  'dashboard-3-solid',
];

const symbols = iconNames.map((name) => {
  const icon = iconSet.icons[name];
  if (!icon) throw new Error(`Streamline Flex icon not found: ${name}`);
  return `<symbol id="${name}" viewBox="0 0 ${icon.width ?? iconSet.width ?? 14} ${icon.height ?? iconSet.height ?? 14}">${icon.body}</symbol>`;
});

// Streamline Flex does not include these primitive controls. They are kept as
// compact filled glyphs in the same 14×14 coordinate system.
symbols.push(
  '<symbol id="control-plus" viewBox="0 0 14 14"><path fill="currentColor" d="M6 1.75a1 1 0 0 1 2 0V6h4.25a1 1 0 1 1 0 2H8v4.25a1 1 0 1 1-2 0V8H1.75a1 1 0 1 1 0-2H6z"/></symbol>',
  '<symbol id="control-plus-circle" viewBox="0 0 14 14"><path fill="currentColor" fill-rule="evenodd" d="M7 14A7 7 0 1 0 7 0a7 7 0 0 0 0 14M6 3.5a1 1 0 1 1 2 0V6h2.5a1 1 0 1 1 0 2H8v2.5a1 1 0 1 1-2 0V8H3.5a1 1 0 1 1 0-2H6z" clip-rule="evenodd"/></symbol>',
  '<symbol id="control-chevron-right" viewBox="0 0 14 14"><path fill="currentColor" d="M4.18 1.72a1 1 0 0 1 1.41 0l4.58 4.57a1 1 0 0 1 0 1.42l-4.58 4.57a1 1 0 1 1-1.41-1.41L8.05 7 4.18 3.13a1 1 0 0 1 0-1.41"/></symbol>',
  '<symbol id="control-chevron-left" viewBox="0 0 14 14"><path fill="currentColor" d="M9.82 1.72a1 1 0 0 0-1.41 0L3.83 6.29a1 1 0 0 0 0 1.42l4.58 4.57a1 1 0 1 0 1.41-1.41L5.95 7l3.87-3.87a1 1 0 0 0 0-1.41"/></symbol>',
  '<symbol id="control-chevron-down" viewBox="0 0 14 14"><path fill="currentColor" d="M1.72 4.18a1 1 0 0 1 1.41 0L7 8.05l3.87-3.87a1 1 0 1 1 1.41 1.41L7.71 10.17a1 1 0 0 1-1.42 0L1.72 5.59a1 1 0 0 1 0-1.41"/></symbol>',
  '<symbol id="control-close-circle" viewBox="0 0 14 14"><path fill="currentColor" fill-rule="evenodd" d="M7 14A7 7 0 1 0 7 0a7 7 0 0 0 0 14M4.47 4.47a.85.85 0 0 1 1.2 0L7 5.8l1.33-1.33a.85.85 0 1 1 1.2 1.2L8.2 7l1.33 1.33a.85.85 0 1 1-1.2 1.2L7 8.2 5.67 9.53a.85.85 0 1 1-1.2-1.2L5.8 7 4.47 5.67a.85.85 0 0 1 0-1.2" clip-rule="evenodd"/></symbol>',
  '<symbol id="control-eye" viewBox="0 0 14 14"><path fill="currentColor" fill-rule="evenodd" d="M.41 6.3C1.5 3.56 3.86 2 7 2s5.5 1.56 6.59 4.3a1.9 1.9 0 0 1 0 1.4C12.5 10.44 10.14 12 7 12S1.5 10.44.41 7.7a1.9 1.9 0 0 1 0-1.4M7 9.75A2.75 2.75 0 1 0 7 4.25a2.75 2.75 0 0 0 0 5.5m0-1.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5" clip-rule="evenodd"/></symbol>',
  '<symbol id="control-menu-dots" viewBox="0 0 14 14"><path fill="currentColor" d="M2 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"/></symbol>',
);

const output = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- Streamline Flex solid icons by Streamline (CC BY 4.0): https://streamlinehq.com -->',
  '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<defs>',
  ...symbols,
  '</defs>',
  '</svg>',
  '',
].join('\n');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(`Generated ${outputPath} (${symbols.length} symbols)`);
