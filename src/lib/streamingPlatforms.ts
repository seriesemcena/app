export const STREAMING_COLORS = {
  netflix: '#E50914',
  prime: '#3798ff',
  disney: '#7acde0',
  hbo: '#2a6eb5',
  apple: '#555555',
  globo: '#F61E22',
  paramount: '#0064FF',
  mgm: '#c2a34c',
} as const;

const STREAMING_COLOR_ALIASES: Record<string, string> = {
  netflix: STREAMING_COLORS.netflix,
  '8': STREAMING_COLORS.netflix,
  prime: STREAMING_COLORS.prime,
  'prime video': STREAMING_COLORS.prime,
  'amazon prime video': STREAMING_COLORS.prime,
  '119': STREAMING_COLORS.prime,
  disney: STREAMING_COLORS.disney,
  'disney+': STREAMING_COLORS.disney,
  'disney plus': STREAMING_COLORS.disney,
  '337': STREAMING_COLORS.disney,
  hbo: STREAMING_COLORS.hbo,
  max: STREAMING_COLORS.hbo,
  'hbo max': STREAMING_COLORS.hbo,
  '1899': STREAMING_COLORS.hbo,
  '384': STREAMING_COLORS.hbo,
  globo: STREAMING_COLORS.globo,
  globoplay: STREAMING_COLORS.globo,
  '307': STREAMING_COLORS.globo,
  mgm: STREAMING_COLORS.mgm,
  'mgm+': STREAMING_COLORS.mgm,
  'mgm plus': STREAMING_COLORS.mgm,
  '2141': STREAMING_COLORS.mgm,
  '34': STREAMING_COLORS.mgm,
  star: STREAMING_COLORS.mgm,
  'star+': STREAMING_COLORS.mgm,
  apple: STREAMING_COLORS.apple,
  'apple tv+': STREAMING_COLORS.apple,
  '350': STREAMING_COLORS.apple,
  paramount: STREAMING_COLORS.paramount,
  'paramount+': STREAMING_COLORS.paramount,
  '531': STREAMING_COLORS.paramount,
};

export function streamingColor(idOrName?: string | null, fallback = 'rgba(255,255,255,0.28)') {
  if (!idOrName) return fallback;
  return STREAMING_COLOR_ALIASES[idOrName.trim().toLowerCase()] ?? fallback;
}

const STREAMING_LOGO_ALIASES: Array<{ aliases: string[]; asset: string }> = [
  { aliases: ['netflix'], asset: 'netflix' },
  { aliases: ['prime video', 'amazon prime', 'prime'], asset: 'primevideo' },
  { aliases: ['disney+', 'disney plus', 'disney'], asset: 'dineyplus' },
  { aliases: ['hbo max', 'hbo', 'max'], asset: 'hbomax' },
  { aliases: ['tv globo', 'rede globo', 'globoplay', 'globo'], asset: 'globoplay' },
  { aliases: ['apple tv+', 'apple tv plus', 'apple tv', 'apple'], asset: 'appletv' },
  { aliases: ['paramount+', 'paramount plus', 'paramount'], asset: 'paramountplus' },
  { aliases: ['mgm+', 'mgm plus', 'mgm'], asset: 'mgm' },
];

export function streamingLogoAsset(name?: string | null, dark = true) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const logo = STREAMING_LOGO_ALIASES.find(({ aliases }) =>
    aliases.some(alias => normalized === alias || normalized.includes(alias))
  );
  return logo ? `/${logo.asset}_logo${dark ? '' : '_black'}.png` : null;
}
