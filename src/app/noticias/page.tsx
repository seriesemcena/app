'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { navigateBack } from '@/lib/navigation';

type NewsPost = {
  id: number;
  title: string;
  image: string | null;
  link: string;
  date: string;
};

type Category = {
  id: string;
  label: string;
  category?: string;
  tag?: string;
};

const CATEGORIES: Category[] = [
  { id: 'destaques', label: 'Destaques' },
  { id: 'series',    label: 'Séries',    category: 'series' },
  { id: 'filmes',    label: 'Filmes',    category: 'filmes' },
  { id: 'doramas',   label: 'Doramas',   tag: 'doramas' },
  { id: 'streaming', label: 'Streaming', category: 'streaming' },
  { id: 'tv',        label: 'TV',        category: 'tv' },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

/* ── Hero card (first post) ─────────────────────────────────── */
function HeroCard({ post }: { post: NewsPost }) {
  return (
    <a
      href={post.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'block', position: 'relative', borderRadius: 18,
        overflow: 'hidden', background: T.surface,
        aspectRatio: '16/9', flexShrink: 0,
        textDecoration: 'none', cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt={post.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.88) 100%)',
      }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 16px 18px' }}>
        <Txt size={17} weight={800} color={T.white}
          style={{ display: 'block', lineHeight: 1.3, letterSpacing: -0.3 } as React.CSSProperties}>
          {post.title}
        </Txt>
        <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 6 }}>
          {formatDate(post.date)}
        </Txt>
      </div>
    </a>
  );
}

/* ── List card (subsequent posts) ───────────────────────────── */
function ListCard({ post }: { post: NewsPost }) {
  return (
    <a
      href={post.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', gap: 12, alignItems: 'center',
        textDecoration: 'none', cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 110, height: 72, borderRadius: 12, overflow: 'hidden',
        flexShrink: 0, background: T.surface,
      }}>
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image} alt={post.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="film" size={24} color={T.t4} />
          </div>
        )}
      </div>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={13} weight={700} color={T.t1}
          style={{
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
            lineHeight: 1.4,
          } as React.CSSProperties}>
          {post.title}
        </Txt>
        <Txt size={10} color={T.t4} style={{ display: 'block', marginTop: 5 }}>
          {formatDate(post.date)}
        </Txt>
      </div>
    </a>
  );
}

/* ── Skeletons ───────────────────────────────────────────────── */
function HeroSkeleton() {
  return <div className="img-skeleton" style={{ borderRadius: 18, aspectRatio: '16/9' }} />;
}
function ListSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div className="img-skeleton" style={{ width: 110, height: 72, borderRadius: 12, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="img-skeleton" style={{ height: 13, width: '90%', borderRadius: 4 }} />
        <div className="img-skeleton" style={{ height: 13, width: '70%', borderRadius: 4 }} />
        <div className="img-skeleton" style={{ height: 10, width: '40%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function NoticiasPage() {
  const router = useRouter();
  const [activeCat, setActiveCat] = useState<string>('destaques');
  const [posts, setPosts]     = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const fetchNews = useCallback(async (cat: Category) => {
    setLoading(true);
    setError(false);
    setPosts([]);
    try {
      const params = new URLSearchParams();
      if (cat.category) params.set('category', cat.category);
      if (cat.tag)      params.set('tag', cat.tag);
      const res  = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (Array.isArray(data)) setPosts(data);
      else throw new Error();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cat = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0];
    fetchNews(cat);
  }, [activeCat, fetchNews]);

  return (
    <Frame>
      <Screen>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 10px', flexShrink: 0,
        }}>
          {/* Back */}
          <button
            onClick={() => navigateBack(router)}
            style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--c-glass-bg)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevronL" size={18} color={T.t2} />
          </button>

          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/news-image?path=%2Fwp-content%2Fuploads%2F2025%2F02%2Flogo-seriesemcena-021.png"
            alt="Séries em Cena"
            style={{ height: 28, width: 'auto', objectFit: 'contain' }}
          />

          {/* Refresh */}
          <button
            onClick={() => { const c = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0]; fetchNews(c); }}
            style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--c-glass-bg)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="wifi" size={17} color={T.t2} />
          </button>
        </div>

        {/* ── Category pills ── */}
        <div style={{
          display: 'flex', gap: 8, padding: '4px 16px 14px',
          overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
        } as React.CSSProperties}>
          {CATEGORIES.map((cat) => {
            const active = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                style={{
                  padding: '9px 20px', borderRadius: 24, flexShrink: 0,
                  background: active ? T.pillActiveBg : 'transparent',
                  border: active ? 'none' : `1px solid ${T.dim}`,
                  color: active ? T.pillActiveText : T.t2,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Area','Inter',sans-serif", transition: 'all 0.2s',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <ScrollArea>
          {/* Loading */}
          {loading && (
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <HeroSkeleton />
              {Array.from({ length: 6 }).map((_, i) => <ListSkeleton key={i} />)}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <Icon name="wifi" size={48} color={T.t4} style={{ marginBottom: 16 }} />
              <Txt size={15} weight={700} style={{ display: 'block', marginBottom: 8 }}>Erro ao carregar</Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block', marginBottom: 24 }}>Verifique sua conexão e tente novamente.</Txt>
              <button
                onClick={() => { const c = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0]; fetchNews(c); }}
                style={{ padding: '10px 24px', borderRadius: 24, background: T.pink, border: 'none', cursor: 'pointer' }}
              >
                <Txt size={13} weight={700} color={T.white}>Tentar novamente</Txt>
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && posts.length === 0 && (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <Icon name="bell" size={48} color={T.t4} style={{ marginBottom: 16 }} />
              <Txt size={15} weight={700} style={{ display: 'block', marginBottom: 8 }}>Nenhuma notícia</Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block' }}>Nenhum artigo encontrado nesta categoria.</Txt>
            </div>
          )}

          {/* Posts */}
          {!loading && !error && posts.length > 0 && (
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Hero */}
              <HeroCard post={posts[0]} />

              {/* List */}
              {posts.slice(1).map((post) => (
                <ListCard key={post.id} post={post} />
              ))}

              {/* Footer link */}
              <div style={{ padding: '8px 0 4px', textAlign: 'center' }}>
                <a
                  href="https://seriesemcena.com.br"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Txt size={12} color={T.t3} weight={600}>Ver tudo em seriesemcena.com.br →</Txt>
                </a>
              </div>
            </div>
          )}

          <div style={{ height: 100 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
