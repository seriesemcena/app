'use client';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, Logo } from '@/components/primitives';
import { tmdb, tmdbImg, useTMDB, type TMDBItem } from '@/lib/tmdb';

function PosterCol({ items, animClass }: { items: TMDBItem[]; animClass: string }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
      <div className={animClass} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {doubled.map((item, i) => (
          <img
            key={`${item.id}-${i}`}
            src={tmdbImg(item.poster_path, 'w185') ?? ''}
            alt=""
            style={{ width: '100%', borderRadius: 10, display: 'block' }}
          />
        ))}
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const { data } = useTMDB(() => tmdb.trending('all', 'week'), []);
  const posters: TMDBItem[] = ((data as any)?.results ?? [])
    .filter((i: TMDBItem) => i.poster_path)
    .slice(0, 21);

  const col1 = posters.filter((_, i) => i % 3 === 0);
  const col2 = posters.filter((_, i) => i % 3 === 1);
  const col3 = posters.filter((_, i) => i % 3 === 2);

  return (
    <Frame>
      <Screen style={{ background: '#0D0D0F', position: 'relative', overflow: 'hidden' }}>
        {/* CSS keyframe animations */}
        <style>{`
          @keyframes scrollUp {
            0%   { transform: translateY(0); }
            100% { transform: translateY(-50%); }
          }
          @keyframes scrollDown {
            0%   { transform: translateY(-50%); }
            100% { transform: translateY(0); }
          }
          .poster-col-up   { animation: scrollUp   30s linear infinite; }
          .poster-col-down { animation: scrollDown 36s linear infinite; }
        `}</style>

        {/* Poster columns */}
        {posters.length > 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', gap: 8, padding: '0 8px',
            opacity: 0.42, zIndex: 0,
          }}>
            <PosterCol items={col1} animClass="poster-col-up" />
            <PosterCol items={col2} animClass="poster-col-down" />
            <PosterCol items={col3} animClass="poster-col-up" />
          </div>
        )}

        {/* Dark gradient overlay — stronger at edges, reveals posters in center */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to bottom, #0D0D0F 0%, rgba(13,13,15,0.25) 30%, rgba(13,13,15,0.25) 55%, #0D0D0F 82%)',
        }} />
        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'rgba(13,13,15,0.30)',
        }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 2,
          flex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-end',
          paddingBottom: 68, paddingLeft: 32, paddingRight: 32,
          textAlign: 'center',
        }}>
          {/* App name */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Logo height={34} style={{ marginBottom: 14 }} />

          {/* Tagline */}
          <div style={{
            fontSize: 15, color: 'rgba(255,255,255,0.56)',
            fontFamily: "'Area','Inter',sans-serif",
            lineHeight: 1.6, marginBottom: 44,
          }}>
            Seu app de filmes e séries.<br />Tudo em um só lugar.
          </div>

          {/* CTA button — Liquid Glass white */}
          <button
            onClick={() => router.push('/auth')}
            style={{
              width: '100%', maxWidth: 320,
              padding: '16px 0', borderRadius: 50,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.3)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,1)',
              color: '#0D0D0F', fontSize: 16, fontWeight: 700,
              fontFamily: "'Area','Inter',sans-serif",
              cursor: 'pointer', letterSpacing: 0.2,
            }}
          >
            Vamos começar
          </button>
        </div>
      </Screen>
    </Frame>
  );
}
