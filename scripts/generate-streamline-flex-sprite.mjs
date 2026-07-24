import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'node_modules/@iconify-json/streamline-flex/icons.json');
const outputPath = resolve(root, 'public/icons/streamline-flex-solid.svg');
const playlistPath = resolve(root, 'public/playlist-solid.svg');

const iconSet = JSON.parse(await readFile(sourcePath, 'utf8'));
const playlistSource = await readFile(playlistPath, 'utf8');
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
  'film-slate-solid',
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

// Isolated icons selected from other IconBuddy collections. Keeping them in
// this generated sprite preserves the single-request icon pipeline used by the
// PWA and Android app without adding runtime dependencies.
symbols.push(
  '<symbol id="fa7-solid-check-circle" viewBox="0 0 512 512"><path fill="currentColor" d="M256 512a256 256 0 1 1 0-512a256 256 0 1 1 0 512m118-366.3c-10.7-7.8-25.7-5.4-33.5 5.3L221.1 315.2L169 263.1c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c5 5 11.8 7.5 18.8 7s13.4-4.1 17.5-9.8l135.9-187c7.8-10.7 5.4-25.7-5.3-33.5"/></symbol>',
  '<symbol id="fa7-solid-bell" viewBox="0 0 448 512"><path fill="currentColor" d="M224 0c-17.7 0-32 14.3-32 32v3.2C119 50 64 114.6 64 192v21.7c0 48.1-16.4 94.8-46.4 132.4l-9.8 12.2C2.7 364.6 0 372.4 0 380.5C0 400.1 15.9 416 35.5 416h376.9c19.6 0 35.5-15.9 35.5-35.5c0-8.1-2.7-15.9-7.8-22.2l-9.8-12.2c-29.9-37.6-46.3-84.3-46.3-132.4V192c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32m-62 464c7.1 27.6 32.2 48 62 48s54.9-20.4 62-48z"/></symbol>',
  '<symbol id="icon-park-solid-play" viewBox="0 0 48 48"><path fill="currentColor" fill-rule="evenodd" d="M24 46C11.85 46 2 36.15 2 24S11.85 2 24 2s22 9.85 22 22s-9.85 22-22 22m-6-28.928v13.856c0 1.54 1.667 2.503 3 1.733l12-6.928a2 2 0 0 0 0-3.466l-12-6.928c-1.333-.77-3 .192-3 1.733" clip-rule="evenodd"/></symbol>',
  '<symbol id="uis-comment-dots" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12c0 2.3.8 4.5 2.3 6.3l-2 2c-.4.4-.4 1 0 1.4c.2.2.4.3.7.3h9c5.5 0 10-4.5 10-10S17.5 2 12 2M8 13c-.6 0-1-.4-1-1s.4-1 1-1s1 .4 1 1s-.4 1-1 1m4 0c-.6 0-1-.4-1-1s.4-1 1-1s1 .4 1 1s-.4 1-1 1m4 0c-.6 0-1-.4-1-1s.4-1 1-1s1 .4 1 1s-.4 1-1 1"/></symbol>',
  playlistSource
    .replace(/^[\s\S]*?<svg[^>]*viewBox="([^"]+)"[^>]*>/, '<symbol id="playlist-solid" viewBox="$1">')
    .replace(/<\/svg>\s*$/, '</symbol>')
    .replace(/fill="black"/g, 'fill="currentColor"'),
);

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
  '<!-- Font Awesome Solid icons (Font Awesome Free License): https://fontawesome.com -->',
  '<!-- IconPark Solid and Unicons Solid icons selected through IconBuddy -->',
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
