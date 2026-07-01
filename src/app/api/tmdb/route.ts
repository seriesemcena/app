import { NextRequest, NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export async function GET(req: NextRequest) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ error: 'TMDB_API_KEY missing' }, { status: 500 });

  const params = req.nextUrl.searchParams;
  const endpoint = params.get('endpoint');
  if (!endpoint || !endpoint.startsWith('/')) {
    return NextResponse.json({ error: 'invalid endpoint' }, { status: 400 });
  }

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', 'pt-BR');
  params.forEach((v, k) => { if (k !== 'endpoint') url.searchParams.set(k, v); });

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 * 10 } });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 });
  }
}
