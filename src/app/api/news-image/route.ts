import { NextRequest, NextResponse } from 'next/server';

const SAFE_NEWS_PATH = /^\/wp-content\/uploads\/[A-Za-z0-9_./-]+\.(?:avif|gif|jpe?g|png|webp)$/i;

/** Same-origin relay restricted to the Séries em Cena media library. */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path') || '';

  if (!SAFE_NEWS_PATH.test(path) || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid news image request' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`https://seriesemcena.com.br${path}`, {
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'News image unavailable' }, { status: upstream.status || 502 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Unexpected news image response' }, { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'News image request failed' }, { status: 502 });
  }
}
