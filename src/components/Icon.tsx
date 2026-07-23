'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  AddCircle,
  AltArrowDown,
  AltArrowLeft,
  AltArrowRight,
  Bell,
  Bookmark,
  Calendar,
  Chart2,
  ChatRoundLine,
  CheckCircle,
  Clapperboard,
  ClockCircle,
  CloseCircle,
  CrownMinimalistic,
  Eye,
  FireMinimalistic,
  Flag,
  Heart,
  Home,
  InfoCircle,
  List,
  LockKeyholeMinimalistic,
  Logout2,
  Magnifier,
  MapPoint,
  MedalRibbonStar,
  MenuDots,
  Moon,
  Pen2,
  Play,
  Reply,
  SettingsMinimalistic,
  Share,
  SmileCircle,
  Star,
  Tv,
  TrashBinTrash,
  User,
  WiFiRouterMinimalistic,
} from '@solar-icons/react/ssr';
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

const ICONS: Record<IconName, typeof Home> = {
  home: Home,
  search: Magnifier,
  calendar: Calendar,
  list: List,
  user: User,
  star: Star,
  starO: Star,
  heart: Heart,
  heartO: Heart,
  play: Play,
  check: CheckCircle,
  plus: AddCircle,
  plusPlain: AddCircle,
  chevronR: AltArrowRight,
  chevronL: AltArrowLeft,
  chevronD: AltArrowDown,
  bell: Bell,
  settings: SettingsMinimalistic,
  film: Clapperboard,
  tv: Tv,
  crown: CrownMinimalistic,
  close: CloseCircle,
  info: InfoCircle,
  eye: Eye,
  share: Share,
  fire: FireMinimalistic,
  mappin: MapPoint,
  wifi: WiFiRouterMinimalistic,
  lock: LockKeyholeMinimalistic,
  smile: SmileCircle,
  message: ChatRoundLine,
  flag: Flag,
  chart: Chart2,
  chevronLeft: AltArrowLeft,
  chevronRight: AltArrowRight,
  bookmark: Bookmark,
  award: MedalRibbonStar,
  clock: ClockCircle,
  menuDots: MenuDots,
  moon: Moon,
  logout: Logout2,
  reply: Reply,
  edit: Pen2,
  trash: TrashBinTrash,
};

const BOLD_ICONS = new Set<IconName>(['star', 'heart', 'play', 'plus', 'plusPlain', 'crown', 'fire', 'menuDots']);

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
  const SolarIcon = ICONS[name];
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
      ) : name === 'plusPlain' ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M13 13v7a1 1 0 0 1-2 0v-7H4a1 1 0 0 1 0-2h7V4a1 1 0 0 1 2 0v7h7a1 1 0 0 1 0 2z"
          />
        </svg>
      ) : (
        <SolarIcon
          size={size}
          color="currentColor"
          weight={BOLD_ICONS.has(name) ? 'Bold' : 'Outline'}
        />
      )}
    </span>
  );
}
