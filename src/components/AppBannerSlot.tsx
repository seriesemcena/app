'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { collection, getDocs, limit, query, type Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { firebaseConfigured, getDB } from '@/lib/firebase';

export type AppBannerPage = 'home' | 'search' | 'profile';

type PublicBanner = {
  id: string;
  kind: 'image' | 'html';
  pages: AppBannerPage[];
  imageUrl: string;
  html: string;
  destinationUrl: string;
  altText: string;
  priority: number;
  height: number;
  startsAt: string | null;
  endsAt: string | null;
};

let bannerRequest: Promise<PublicBanner[]> | null = null;

function isoDate(value: unknown) {
  if (!value) return null;
  if (typeof (value as Timestamp).toDate === 'function') return (value as Timestamp).toDate().toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function loadBanners(): Promise<PublicBanner[]> {
  if (!firebaseConfigured) return Promise.resolve([]);
  if (!bannerRequest) {
    bannerRequest = getDocs(query(collection(getDB(), 'public_banners'), limit(40)))
      .then((snapshot) => snapshot.docs.map((document): PublicBanner => {
        const data = document.data();
        return {
          id: document.id,
          kind: data.kind === 'html' ? 'html' : 'image',
          pages: (Array.isArray(data.pages) ? data.pages : []).filter((page): page is AppBannerPage => ['home', 'search', 'profile'].includes(String(page))),
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
          html: typeof data.html === 'string' ? data.html : '',
          destinationUrl: typeof data.destinationUrl === 'string' ? data.destinationUrl : '',
          altText: typeof data.altText === 'string' ? data.altText : '',
          priority: Number(data.priority || 0),
          height: Math.max(80, Math.min(500, Number(data.height || 160))),
          startsAt: isoDate(data.startsAt),
          endsAt: isoDate(data.endsAt),
        };
      }).sort((left, right) => right.priority - left.priority))
      .catch(() => []);
  }
  return bannerRequest ?? Promise.resolve([]);
}

function htmlDocument(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; media-src https:; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}img,video{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
}

function Banner({ banner }: { banner: PublicBanner }) {
  const router = useRouter();
  const srcDoc = useMemo(() => htmlDocument(banner.html), [banner.html]);
  const interactive = Boolean(banner.destinationUrl);
  const open = () => {
    const destination = banner.destinationUrl;
    if (!destination) return;
    if (/^\/(?!\/)/.test(destination)) router.push(destination);
    else if (destination.startsWith('https://')) window.open(destination, '_blank', 'noopener,noreferrer');
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); }
  };
  return <div
    role={interactive ? 'link' : undefined}
    tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? banner.altText || 'Abrir conteúdo do banner' : undefined}
    onClick={open}
    onKeyDown={keyDown}
    style={{ width: '100%', overflow: 'hidden', borderRadius: 20, border: '1px solid var(--c-border)', background: 'var(--c-card)', cursor: interactive ? 'pointer' : 'default', boxShadow: '0 12px 28px rgba(0,0,0,0.12)' }}>
    {banner.kind === 'image'
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={banner.imageUrl} alt={banner.altText || ''} loading="lazy" style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}/>
      : <iframe title={banner.altText || 'Banner'} sandbox="" srcDoc={srcDoc} scrolling="no" style={{ width: '100%', height: banner.height, display: 'block', border: 0, pointerEvents: 'none', background: 'transparent' }}/>
    }
  </div>;
}

export function AppBannerSlot({ page }: { page: AppBannerPage }) {
  const [banners, setBanners] = useState<PublicBanner[]>([]);
  useEffect(() => { let active = true; void loadBanners().then((items) => { if (active) setBanners(items); }); return () => { active = false; }; }, []);
  const visible = useMemo(() => {
    const now = Date.now();
    return banners.filter((banner) => banner.pages.includes(page)
      && (!banner.startsAt || new Date(banner.startsAt).getTime() <= now)
      && (!banner.endsAt || new Date(banner.endsAt).getTime() > now));
  }, [banners, page]);
  if (!visible.length) return null;
  return <section aria-label="Destaques" data-banner-slot={page} style={{ display: 'grid', gap: 12, margin: '16px' }}>
    {visible.map((banner) => <Banner key={banner.id} banner={banner}/>)}
  </section>;
}
