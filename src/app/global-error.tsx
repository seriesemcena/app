'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[UI] Global error', error); }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0D0D0F', color: '#fff', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ minHeight: 'var(--app-height)', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>Não foi possível iniciar o Maratonou</h1>
            <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>Tente novamente. Se o problema continuar, feche e abra o aplicativo.</p>
            <button type="button" onClick={reset} style={{ border: 0, borderRadius: 24, background: '#C069FF', color: '#fff', padding: '12px 22px', fontWeight: 700 }}>Tentar novamente</button>
          </div>
        </main>
      </body>
    </html>
  );
}
