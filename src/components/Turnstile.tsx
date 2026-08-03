'use client';
/* ─────────────────────────────────────────────────────────────
   Cloudflare Turnstile — invisible/managed anti-spam challenge.

   Rendered on the e-mail *registration* path to keep bots from
   mass-creating accounts. The widget is a no-op until the public
   site key is configured (NEXT_PUBLIC_TURNSTILE_SITE_KEY), so the
   sign-up flow keeps working unchanged until keys are added in the
   hosting env. Token verification happens server-side in
   /api/verify-turnstile with the secret key.
   ───────────────────────────────────────────────────────────── */
import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** True only when a site key is configured — callers use this to
    decide whether to gate submission on a token. */
export const TURNSTILE_ENABLED = !!SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('turnstile-load-failed')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  onVerify,
  onExpire,
  theme = 'dark',
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: 'dark' | 'light' | 'auto';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Hold the latest callbacks in refs so the widget renders exactly once
  // (the effect stays independent of inline callback identities).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!SITE_KEY) return; // not configured — render nothing
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || widgetId.current || !containerRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme,
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onExpireRef.current?.(),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
    };
  }, [theme]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }} />;
}
