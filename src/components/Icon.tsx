'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { IconName } from '@/lib/tokens';

type Props = { name: IconName; size?: number; color?: string; style?: CSSProperties };

/* Icons drawn inline instead of from the Streamline sprite, so we can use
   shapes from other open sets. Each keeps its own viewBox. */
const INLINE_ICONS: Partial<Record<IconName, { viewBox: string; content: ReactNode }>> = {
  // delete — mono-icons:delete
  trash: {
    viewBox: '0 0 24 24',
    content: <path fill="currentColor" d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.069l-.867 12.142A2 2 0 0 1 17.069 22H6.93a2 2 0 0 1-1.995-1.858L4.07 8H3a1 1 0 0 1 0-2h4zm2 2h6V4H9zM6.074 8l.857 12H17.07l.857-12zM10 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1m4 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1" />,
  },
  // share — iconamoon:share-2 (stroke-based)
  share: {
    viewBox: '0 0 24 24',
    content: <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 5l-3-3m0 0L9 5m3-3v12M6 9H4v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9h-2" />,
  },
  // report/denúncia — weui:report-problem-filled
  flag: {
    viewBox: '0 0 24 24',
    content: <path fill="currentColor" fillRule="evenodd" d="m21.268 21.053l-18.536.001a1 1 0 0 1-.866-1.5L11.132 3.5a1 1 0 0 1 1.732 0l9.27 16.053a1 1 0 0 1-.866 1.5M11.248 9.545l.116 5.666h1.272l.117-5.666zm.75 8.572c.48 0 .855-.369.855-.832s-.375-.826-.856-.826a.83.83 0 0 0-.85.826c0 .463.375.832.85.832z" clipRule="evenodd" />,
  },
};

const ICONS: Record<IconName, string> = {
  home: 'home-2-solid',
  search: 'magnifying-glass-solid',
  calendar: 'blank-calendar-solid',
  list: 'play-list-6-solid',
  playlist: 'playlist-solid',
  user: 'user-circle-single-solid',
  star: 'uim-star',
  starO: 'uil-star',
  heart: 'heart-solid',
  heartO: 'heart-solid',
  play: 'play-list-4-solid',
  check: 'fa7-solid-check-circle',
  plus: 'control-plus-circle',
  plusPlain: 'control-plus',
  chevronR: 'control-chevron-right',
  chevronL: 'control-chevron-left',
  chevronD: 'control-chevron-down',
  bell: 'fa7-solid-bell',
  settings: 'cog-solid',
  film: 'film-slate-solid',
  tv: 'icon-park-solid-play',
  crown: 'crown-solid',
  close: 'ep-close-bold',
  info: 'information-circle-solid',
  eye: 'control-eye',
  share: 'share-link-solid',
  fire: 'campfire-solid',
  mappin: 'location-pin-3-solid',
  wifi: 'router-wifi-network-solid',
  lock: 'padlock-square-1-solid',
  smile: 'happy-face-solid',
  message: 'uis-comment-dots',
  flag: 'triangle-flag-solid',
  chart: 'graph-bar-increase-square-solid',
  chevronLeft: 'control-chevron-left',
  chevronRight: 'control-chevron-right',
  bookmark: 'bookmark-solid',
  award: 'trophy-solid',
  clock: 'fa7-regular-clock',
  menuDots: 'control-menu-dots',
  moon: 'dark-dislay-mode-solid',
  logout: 'logout-1-solid',
  reply: 'discussion-converstion-reply-solid',
  edit: 'pencil-square-solid',
  trash: 'recycle-bin-solid',
  sparkles: 'magic-wand-1-solid',
  grid: 'dashboard-3-solid',
};

export function Icon({ name, size = 22, color = 'currentColor', style = {} }: Props) {
  const iconId = ICONS[name];
  const inline = INLINE_ICONS[name];

  return (
    <span
      aria-hidden="true"
      data-maratonou-icon-name={name}
      data-maratonou-icon-id={iconId}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color,
        ...style,
      }}
    >
      {inline ? (
        <svg width={size} height={size} viewBox={inline.viewBox} fill="currentColor" aria-hidden="true">
          {inline.content}
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <use href={`/icons/streamline-flex-solid.svg#${iconId}`} />
        </svg>
      )}
    </span>
  );
}
