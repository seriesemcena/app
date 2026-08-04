'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[UI] Global error', error); }, [error]);

  // Self-heal without importing anything (the module graph may be what failed):
  // purge the app's own local caches — account data is safe in Firestore and
  // re-syncs — then hard-reload. Firebase auth keys and theme/locale are kept.
  const recover = () => {
    try {
      if (typeof window !== 'undefined') {
        const keep = new Set(['sec_theme_v1', 'sec_locale_v1', 'sec_region_selected']);
        const drop: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (!key || keep.has(key)) continue;
          if (key.startsWith('sec_') || key.startsWith('maratonou:')) drop.push(key);
        }
        drop.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
        window.location.reload();
        return;
      }
    } catch {}
    reset();
  };

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0D0D0F', color: '#fff', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ minHeight: 'var(--app-height)', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>Não foi possível iniciar o Maratonou</h1>
            <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>Seus dados estão seguros. Toque abaixo para recarregar — se o problema continuar, feche e abra o aplicativo.</p>
            <button type="button" onClick={recover} style={{ border: 0, borderRadius: 24, background: '#C069FF', color: '#fff', padding: '12px 22px', fontWeight: 700 }}>Tentar novamente</button>
          </div>
        </main>
      </body>
    </html>
  );
}
