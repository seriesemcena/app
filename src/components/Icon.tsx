'use client';

import type { CSSProperties } from 'react';
import type { IconName } from '@/lib/tokens';

type Props = { name: IconName; size?: number; color?: string; style?: CSSProperties };

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
      <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <use href={`/icons/streamline-flex-solid.svg#${iconId}`} />
      </svg>
    </span>
  );
}
