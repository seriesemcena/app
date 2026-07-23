'use client';
/* ─────────────────────────────────────────────────────────────
   useDeepLinks — routes native deep links to the in-app page.

   The native shell only *opens* the app when a link is tapped; the
   intent-filters (Android) / Associated Domains (iOS) deliver the URL,
   but nothing navigates without this. Handles both:
     • custom scheme:  maratonou://title/tv/94997
     • universal link: https://maratonou.com/title/tv/94997

   Firebase Auth's own callback schemes (genericidp://, recaptcha://)
   are deliberately ignored so we never hijack the sign-in flow.
   ───────────────────────────────────────────────────────────── */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';

/** Map an incoming deep-link URL to an in-app path, or null to ignore it. */
export function inAppPath(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }

  if (u.protocol === 'https:' || u.protocol === 'http:') {
    // Only our own domain; anything else stays external.
    if (u.hostname !== 'maratonou.com' && u.hostname !== 'www.maratonou.com') return null;
    const path = `${u.pathname}${u.search}${u.hash}`;
    return path.startsWith('/') ? path : `/${path}`;
  }

  if (u.protocol === 'maratonou:') {
    // maratonou://title/tv/94997 → host="title", pathname="/tv/94997"
    const path = `/${u.host}${u.pathname}`.replace(/\/{2,}/g, '/');
    return `${path}${u.search}${u.hash}`;
  }

  // Firebase auth callbacks and everything else: not ours.
  return null;
}

export function useDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanup: (() => void) | undefined;
    let active = true;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');

        // Cold start: the app was launched *by* a deep link.
        try {
          const launch = await App.getLaunchUrl();
          const path = launch?.url ? inAppPath(launch.url) : null;
          if (active && path) router.push(path);
        } catch { /* no launch url */ }

        // Warm: a deep link arrived while the app was already open.
        const sub = await App.addListener('appUrlOpen', ({ url }) => {
          const path = inAppPath(url);
          if (path) router.push(path);
        });
        cleanup = () => { void sub.remove(); };
      } catch { /* @capacitor/app unavailable */ }
    })();

    return () => { active = false; cleanup?.(); };
  }, [router]);
}
