import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/serverAuth';

const TMDB_BASE = 'https://api.themoviedb.org/3';

/* The proxy exists so the TMDB key stays server-side, but that made it an
   open relay: anyone could burn this key's quota on arbitrary TMDB paths.
   Two fences:
   1. Endpoint allowlist — only the path families the app actually uses,
      with a strict segment grammar (no "..", no "//", no query smuggling).
   2. Per-IP rate limit — generous (poster grids fire dozens of parallel
      calls per page) but far below scraping throughput. */
const ENDPOINT_OK = /^\/(movie|tv|search|discover|person|trending)(\/[A-Za-z0-9_-]+)+$/;

export async function GET(req: NextRequest) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ error: 'TMDB_API_KEY missing' }, { status: 500 });

  const params = req.nextUrl.searchParams;
  const endpoint = params.get('endpoint');
  if (!endpoint || !ENDPOINT_OK.test(endpoint)) {
    return NextResponse.json({ error: 'invalid endpoint' }, { status: 400 });
  }

  // Generous ceiling: one page render fires dozens of parallel calls. Keep
  // the protection in production, but never let Next's synthetic localhost
  // forwarded address exhaust a shared bucket during local development.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (process.env.NODE_ENV === 'production' && ip && !rateLimit(`tmdb:${ip}`, 1000, 60_000)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'pt-BR');
  params.forEach((v, k) => { if (k !== 'endpoint') url.searchParams.set(k, v); });

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 * 10 } });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 });
  }
}
