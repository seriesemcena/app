'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { AppErrorState } from '@/components/AppStates';
import { getDB } from '@/lib/firebase';

type PublicLandingPage = {
  title: string;
  slug: string;
  description: string;
  theme: 'dark' | 'light';
  showHeader: boolean;
  html: string;
  css: string;
};

function normalizedSlug(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

function pageDocument(page: PublicLandingPage) {
  const background = page.theme === 'light' ? '#f5f3f7' : '#0d0d0f';
  const color = page.theme === 'light' ? '#17151a' : '#f7f5f8';
  const safeCss = page.css.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; font-src https: data:; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:${background};color:${color};font-family:Inter,system-ui,-apple-system,sans-serif}body{overflow-x:hidden}img,video{max-width:100%;height:auto}${safeCss}</style></head><body>${page.html}</body></html>`;
}

export default function LandingPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = normalizedSlug(params?.slug);
  const [page, setPage] = useState<PublicLandingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setMissing(false); setError(false);
    if (!slug) { setMissing(true); setLoading(false); return () => { active = false; }; }
    getDoc(doc(getDB(), 'public_pages', slug)).then((snapshot) => {
      if (!active) return;
      if (!snapshot.exists()) { setMissing(true); return; }
      const data = snapshot.data();
      const next: PublicLandingPage = {
        title: typeof data.title === 'string' ? data.title : 'Maratonou',
        slug,
        description: typeof data.description === 'string' ? data.description : '',
        theme: data.theme === 'light' ? 'light' : 'dark',
        showHeader: data.showHeader !== false,
        html: typeof data.html === 'string' ? data.html : '',
        css: typeof data.css === 'string' ? data.css : '',
      };
      if (!next.html) { setMissing(true); return; }
      setPage(next);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    const previousTitle = document.title;
    document.title = `${page.title} · Maratonou`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (!meta) {
      meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta);
    }
    if (page.description) meta.content = page.description;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription != null) meta.content = previousDescription;
    };
  }, [page]);

  const srcDoc = useMemo(() => page ? pageDocument(page) : '', [page]);
  const goBack = () => window.history.length > 1 ? router.back() : router.replace('/home');
  const share = async () => {
    if (!page) return;
    const data = { title: page.title, text: page.description, url: window.location.href };
    if (navigator.share) await navigator.share(data).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  };

  if (loading) return <main className="landing-page-state" role="status"><span className="landing-page-spinner"/><p>Carregando página…</p></main>;
  if (missing) return <main className="landing-page-state"><AppErrorState title="Página não encontrada" message="Esta página não existe, está em rascunho ou foi removida." actionLabel="Ir para o início" onRetry={() => router.replace('/home')}/></main>;
  if (error || !page) return <main className="landing-page-state"><AppErrorState title="Não foi possível abrir a página" message="Confira sua conexão e tente novamente." onRetry={() => window.location.reload()}/></main>;

  return <main className={`landing-page-shell landing-page-${page.theme}${page.showHeader ? ' has-header' : ''}`}>
    {page.showHeader && <header className="landing-page-header"><button type="button" aria-label="Voltar" onClick={goBack}><Icon name="chevronLeft" size={20}/></button><strong>{page.title}</strong><button type="button" aria-label="Compartilhar" onClick={() => void share()}><Icon name="share" size={19}/></button></header>}
    <iframe className="landing-page-frame" title={page.title} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" srcDoc={srcDoc}/>
  </main>;
}
