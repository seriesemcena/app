'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { usePathname, useRouter } from 'next/navigation';
import { getFirebaseFunctions } from '@/lib/firebase';

type PopupFrequency = 'every_visit' | 'once_session' | 'once_day' | 'once_user' | 'custom';
type PopupCampaign = {
  id: string;
  imageDesktopUrl: string;
  imageMobileUrl?: string;
  altText: string;
  destinationUrl?: string;
  openTarget: 'same' | 'new';
  frequency: PopupFrequency;
  frequencyHours: number;
  priority: number;
};
type LocalRecord = { frequency: PopupFrequency; frequencyHours: number; lastAt: number };

const SESSION_KEY = 'maratonou.popup-banners.session.v1';
const LOCAL_KEY = 'maratonou.popup-banners.local.v1';
const SESSION_ID_KEY = 'maratonou.popup-banners.session-id.v1';
const BLOCKED_ROUTES = [
  '/auth',
  '/admin',
  '/privacy',
  '/terms',
  '/delete-account',
  '/legal/privacy',
  '/legal/terms',
  '/legal/delete-account',
];

function readObject<T>(storage: Storage, key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, T> : {};
  } catch { return {}; }
}

function writeObject<T>(storage: Storage, key: string, value: Record<string, T>) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can reject persistence. */ }
}

function platformName() {
  const native = Capacitor.getPlatform();
  if (native === 'ios' || native === 'android') return native;
  return window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'web';
}

function getSessionId() {
  try {
    const current = sessionStorage.getItem(SESSION_ID_KEY);
    if (current) return current;
    const created = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, created);
    return created;
  } catch { return crypto.randomUUID(); }
}

function excludedCampaigns(now = Date.now()) {
  const session = readObject<number>(sessionStorage, SESSION_KEY);
  const local = readObject<LocalRecord>(localStorage, LOCAL_KEY);
  const excluded = new Set(Object.keys(session));
  for (const [id, record] of Object.entries(local)) {
    if (!record || !record.lastAt) continue;
    if (record.frequency === 'once_user') excluded.add(id);
    if (record.frequency === 'once_day' && now - record.lastAt < 24 * 60 * 60 * 1000) excluded.add(id);
    if (record.frequency === 'custom' && now - record.lastAt < Math.max(1, record.frequencyHours || 24) * 60 * 60 * 1000) excluded.add(id);
  }
  return [...excluded].slice(0, 50);
}

function rememberCampaign(campaign: PopupCampaign, event: 'view' | 'close' = 'view') {
  const now = Date.now();
  if (campaign.frequency === 'once_session' || (campaign.frequency === 'every_visit' && event === 'close')) {
    const session = readObject<number>(sessionStorage, SESSION_KEY);
    session[campaign.id] = now;
    writeObject(sessionStorage, SESSION_KEY, session);
  }
  if (campaign.frequency === 'once_day' || campaign.frequency === 'once_user' || campaign.frequency === 'custom') {
    const local = readObject<LocalRecord>(localStorage, LOCAL_KEY);
    local[campaign.id] = { frequency: campaign.frequency, frequencyHours: campaign.frequencyHours, lastAt: now };
    writeObject(localStorage, LOCAL_KEY, local);
  }
}

async function preloadSource(source: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Imagem indisponível'));
    image.src = source;
  });
}

async function preloadCampaign(campaign: PopupCampaign): Promise<PopupCampaign> {
  if (window.matchMedia('(max-width: 680px)').matches && campaign.imageMobileUrl) {
    try {
      await preloadSource(campaign.imageMobileUrl);
      return campaign;
    } catch {
      await preloadSource(campaign.imageDesktopUrl);
      return { ...campaign, imageMobileUrl: undefined };
    }
  }
  await preloadSource(campaign.imageDesktopUrl);
  return campaign;
}

export function PopupBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [campaign, setCampaign] = useState<PopupCampaign | null>(null);
  const platform = useMemo(() => typeof window === 'undefined' ? 'web' : platformName(), []);
  const sessionId = useRef('');

  const track = useCallback(async (event: 'view' | 'click' | 'close', item: PopupCampaign) => {
    try {
      if (!sessionId.current) sessionId.current = getSessionId();
      const send = httpsCallable(getFirebaseFunctions(), 'trackPopupBannerEvent');
      await send({ bannerId: item.id, event, platform, eventId: `${sessionId.current}:${item.id}:${event}` });
    } catch { /* Metrics must never interrupt the experience. */ }
  }, [platform]);

  useEffect(() => {
    if (BLOCKED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const run = async () => {
        try {
          const select = httpsCallable<Record<string, unknown>, { banner: PopupCampaign | null }>(getFirebaseFunctions(), 'getEligiblePopupBanner');
          const result = await select({ platform, excludedIds: excludedCampaigns() });
          const next = result.data.banner;
          if (!next || cancelled) return;
          const loaded = await preloadCampaign(next);
          if (cancelled) return;
          rememberCampaign(loaded);
          setCampaign(loaded);
          void track('view', loaded);
        } catch { /* The campaign layer is optional and intentionally silent. */ }
      };
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback(() => void run(), { timeout: 1800 });
      } else void run();
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pathname, platform, track]);

  useEffect(() => {
    if (!campaign) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      rememberCampaign(campaign, 'close');
      void track('close', campaign);
      setCampaign(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKeyDown); };
  }, [campaign, track]);

  if (!campaign) return null;

  const close = () => {
    rememberCampaign(campaign, 'close');
    void track('close', campaign);
    setCampaign(null);
  };
  const open = () => {
    const destination = campaign.destinationUrl?.trim();
    if (!destination) return;
    rememberCampaign(campaign, 'close');
    void track('click', campaign);
    try {
      const parsed = new URL(destination, window.location.origin);
      setCampaign(null);
      if (campaign.openTarget === 'new') window.open(parsed.href, '_blank', 'noopener,noreferrer');
      else if (parsed.origin === window.location.origin) router.push(`${parsed.pathname}${parsed.search}${parsed.hash}`);
      else window.location.assign(parsed.href);
    } catch { /* Invalid links are rejected in the admin API as well. */ }
  };

  return (
    <div className="app-popup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="app-popup-dialog" role="dialog" aria-modal="true" aria-label={campaign.altText || 'Destaque'}>
        <button type="button" className="app-popup-close" aria-label="Fechar" onClick={close}>×</button>
        <button type="button" className="app-popup-media" onClick={campaign.destinationUrl ? open : undefined} aria-label={campaign.destinationUrl ? `${campaign.altText}. Abrir conteúdo` : undefined}>
          <picture>
            {campaign.imageMobileUrl ? <source media="(max-width: 680px)" srcSet={campaign.imageMobileUrl}/> : null}
            <img src={campaign.imageDesktopUrl} alt={campaign.altText}/>
          </picture>
        </button>
      </section>
    </div>
  );
}
