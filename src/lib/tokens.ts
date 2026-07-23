/* ─── Design tokens ───────────────────────────────────────────
   Colors use CSS custom properties so the light/dark theme
   is applied instantly by toggling [data-theme] on <html>.
   Accent colors (pink, gold, red) are identical in both themes.
   ──────────────────────────────────────────────────────────── */
export const T = {
  /* backgrounds */
  bg:       'var(--c-bg)',
  card:     'var(--c-card)',
  surface:  'var(--c-surface)',
  surface2: 'var(--c-surface2)',

  /* text */
  t1: 'var(--c-t1)',
  t2: 'var(--c-t2)',
  t3: 'var(--c-t3)',
  t4: 'var(--c-t4)',

  /* separator / outline */
  border:      'var(--c-border)',
  dim:         'var(--c-dim)',        /* slightly stronger border/divider */

  /* form fields & frosted-glass buttons */
  inputBg:     'var(--c-input-bg)',   /* textarea / input background */
  glassBg:     'var(--c-glass-bg)',   /* frosted pill / icon-button bg */
  pillActiveBg:     'var(--c-pill-active-bg)',
  pillActiveText:   'var(--c-pill-active-text)',
  pillActiveBorder: 'var(--c-pill-active-border)',

  /* always-white (text on coloured buttons, etc.) */
  white: '#FFFFFF',

  /* accents — same in both themes */
  red:      '#E50914',
  redDim:   'rgba(229,9,20,0.15)',
  gold:     '#F5C518',
  goldDim:  'rgba(245,197,24,0.15)',
  pink:     '#C069FF',
  pinkGlow: 'rgba(192,105,255,0.35)',
  active:   '#0B0B0D',

  /* radii (numeric, not colours) */
  radius:   22,
  radiusSm: 14,
  radiusXs: 9,
} as const;

export type IconName =
  | 'home' | 'search' | 'calendar' | 'list' | 'user'
  | 'star' | 'starO' | 'heart' | 'heartO' | 'play' | 'check' | 'plus' | 'plusPlain'
  | 'chevronR' | 'chevronL' | 'chevronD' | 'bell' | 'settings'
  | 'film' | 'tv' | 'crown' | 'close' | 'info' | 'eye' | 'share'
  | 'fire' | 'mappin' | 'wifi' | 'lock' | 'smile' | 'message' | 'flag'
  | 'chart' | 'chevronLeft' | 'chevronRight' | 'bookmark' | 'award' | 'clock' | 'menuDots'
  | 'moon' | 'logout' | 'reply' | 'edit' | 'trash' | 'sparkles' | 'grid';
