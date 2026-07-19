import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_SIZES = new Set([
  'w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'original',
]);
const SAFE_FILE_PATH = /^\/[A-Za-z0-9._-]+\.(?:avif|jpe?g|png|webp)$/i;

/** Same-origin, allowlisted TMDB image relay.
 *
 * Some installed-app browsers and restrictive networks block third-party image
 * CDNs even when the TMDB API itself is reachable. Keeping this relay limited
 * to TMDB file paths avoids turning it into a general-purpose SSRF proxy.
 */
export async function GET(request: NextRequest) {
  const size = request.nextUrl.searchParams.get('size') || 'w342';
  const path = request.nextUrl.searchParams.get('path') || '';

  if (!ALLOWED_SIZES.has(size) || !SAFE_FILE_PATH.test(path)) {
    return NextResponse.json({ error: 'Invalid TMDB image request' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`https://image.tmdb.org/t/p/${size}${path}`, {
      cache: 'force-cache',
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'TMDB image unavailable' }, { status: upstream.status || 502 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Unexpected TMDB response' }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'TMDB image request failed' }, { status: 502 });
  }
}
