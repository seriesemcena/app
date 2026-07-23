'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { IconName } from '@/lib/tokens';

type Props = { name: IconName; size?: number; color?: string; style?: CSSProperties };

type SFSymbolRenderOptions = {
  name: string;
  size: number;
  weight: 'semibold' | 'bold';
};

type SFSymbolRenderResult = { dataUrl: string };

type SFSymbolsNativePlugin = {
  render(options: SFSymbolRenderOptions): Promise<SFSymbolRenderResult>;
};

const SFSymbols = registerPlugin<SFSymbolsNativePlugin>('SFSymbols');

const ICONS: Record<IconName, string> = {
  home: 'home-2-solid',
  search: 'magnifying-glass-solid',
  calendar: 'blank-calendar-solid',
  list: 'play-list-6-solid',
  user: 'user-circle-single-solid',
  star: 'star-circle-solid',
  starO: 'star-circle-solid',
  heart: 'heart-solid',
  heartO: 'heart-solid',
  play: 'play-list-4-solid',
  check: 'check-square-solid',
  plus: 'control-plus-circle',
  plusPlain: 'control-plus',
  chevronR: 'control-chevron-right',
  chevronL: 'control-chevron-left',
  chevronD: 'control-chevron-down',
  bell: 'bell-solid',
  settings: 'cog-solid',
  film: 'film-solid',
  tv: 'screen-curve-solid',
  crown: 'crown-solid',
  close: 'control-close-circle',
  info: 'information-circle-solid',
  eye: 'control-eye',
  share: 'share-link-solid',
  fire: 'campfire-solid',
  mappin: 'location-pin-3-solid',
  wifi: 'router-wifi-network-solid',
  lock: 'padlock-square-1-solid',
  smile: 'happy-face-solid',
  message: 'chat-bubble-text-square-solid',
  flag: 'triangle-flag-solid',
  chart: 'graph-bar-increase-square-solid',
  chevronLeft: 'control-chevron-left',
  chevronRight: 'control-chevron-right',
  bookmark: 'bookmark-solid',
  award: 'trophy-solid',
  clock: 'stopwatch-solid',
  menuDots: 'control-menu-dots',
  moon: 'dark-dislay-mode-solid',
  logout: 'logout-1-solid',
  reply: 'discussion-converstion-reply-solid',
  edit: 'pencil-square-solid',
  trash: 'recycle-bin-solid',
  sparkles: 'magic-wand-1-solid',
  grid: 'dashboard-3-solid',
};

const BOLD_ICONS = new Set<IconName>(['star', 'heart', 'play', 'plus', 'plusPlain', 'crown', 'fire', 'menuDots', 'sparkles']);

/** Native iOS names. The public IconName API stays platform-independent. */
const SF_SYMBOLS: Record<IconName, string> = {
  home: 'house',
  search: 'magnifyingglass',
  calendar: 'calendar',
  list: 'list.bullet',
  user: 'person',
  star: 'star.fill',
  starO: 'star',
  heart: 'heart.fill',
  heartO: 'heart',
  play: 'play.fill',
  check: 'checkmark.circle',
  plus: 'plus.circle',
  plusPlain: 'plus',
  chevronR: 'chevron.right',
  chevronL: 'chevron.left',
  chevronD: 'chevron.down',
  bell: 'bell',
  settings: 'gearshape',
  film: 'film',
  tv: 'tv',
  crown: 'crown.fill',
  close: 'xmark.circle',
  info: 'info.circle',
  eye: 'eye',
  share: 'square.and.arrow.up',
  fire: 'flame.fill',
  mappin: 'mappin',
  wifi: 'wifi',
  lock: 'lock',
  smile: 'face.smiling',
  message: 'bubble.left',
  flag: 'flag',
  chart: 'chart.bar',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  bookmark: 'bookmark',
  award: 'rosette',
  clock: 'clock',
  menuDots: 'ellipsis',
  moon: 'moon',
  logout: 'rectangle.portrait.and.arrow.right',
  reply: 'arrowshape.turn.up.left',
  edit: 'pencil',
  trash: 'trash',
  sparkles: 'sparkles',
  grid: 'square.grid.2x2',
};

const nativeSymbolCache = new Map<string, Promise<string | null>>();

function loadNativeSymbol(name: IconName, size: number): Promise<string | null> {
  const symbolName = SF_SYMBOLS[name];
  const weight = BOLD_ICONS.has(name) ? 'bold' : 'semibold';
  const cacheKey = `${symbolName}:${size}:${weight}`;
  const cached = nativeSymbolCache.get(cacheKey);
  if (cached) return cached;

  const pending = SFSymbols.render({ name: symbolName, size, weight })
    .then((result) => result.dataUrl || null)
    .catch(() => null);
  nativeSymbolCache.set(cacheKey, pending);
  return pending;
}

export function Icon({ name, size = 22, color = 'currentColor', style = {} }: Props) {
  const iconId = ICONS[name];
  const [nativeMask, setNativeMask] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const nativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    if (!nativeIOS) {
      setNativeMask(null);
      return () => { active = false; };
    }

    loadNativeSymbol(name, size).then((dataUrl) => {
      if (active) setNativeMask(dataUrl);
    });
    return () => { active = false; };
  }, [name, size]);

  return (
    <span
      aria-hidden="true"
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
      {nativeMask ? (
        <span
          style={{
            width: size,
            height: size,
            display: 'block',
            backgroundColor: 'currentColor',
            WebkitMaskImage: `url("${nativeMask}")`,
            maskImage: `url("${nativeMask}")`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
          }}
        />
      ) : (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <use href={`/icons/streamline-flex-solid.svg#${iconId}`} />
        </svg>
      )}
    </span>
  );
}
