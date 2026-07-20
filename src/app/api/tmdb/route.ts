import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/serverAuth';
import { getAdminDB, hasAdminCredentials } from '@/lib/server/firebaseAdmin';

const TMDB_BASE = 'https://api.themoviedb.org/3';

/* The proxy exists so the TMDB key stays server-side, but that made it an
   open relay: anyone could burn this key's quota on arbitrary TMDB paths.
   Two fences:
   1. Endpoint allowlist — only the path families the app actually uses,
      with a strict segment grammar (no "..", no "//", no query smuggling).
   2. Per-IP rate limit — generous (poster grids fire dozens of parallel
      calls per page) but far below scraping throughput. */
const ENDPOINT_OK = /^\/(movie|tv|search|discover|person|trending)(\/[A-Za-z0-9_-]+)+$/;

type TmdbPayload = Record<string, any>;

function mediaType(endpoint: string, item: TmdbPayload): 'movie' | 'tv' | null {
  if (item.media_type === 'movie' || item.media_type === 'tv') return item.media_type;
  if (endpoint.startsWith('/movie/')) return 'movie';
  if (endpoint.startsWith('/tv/')) return 'tv';
  return item.first_air_date ? 'tv' : item.release_date ? 'movie' : null;
}

function mergeOverride(item: TmdbPayload, override: TmdbPayload, type: 'movie' | 'tv') {
  if (override.localTitle) {
    if (type === 'movie') item.title = override.localTitle;
    else item.name = override.localTitle;
  }
  if (override.localOverview) item.overview = override.localOverview;
  item.admin_featured = override.featured === true;
  return item;
}

async function applyContentOverrides(endpoint: string, payload: TmdbPayload) {
  if (!hasAdminCredentials()) return payload;
  try {
    const database = getAdminDB();
    if (Array.isArray(payload.results)) {
      const keyed = payload.results
        .map((item: TmdbPayload) => ({ item, type: mediaType(endpoint, item) }))
        .filter((entry: { type: string | null }) => entry.type === 'movie' || entry.type === 'tv') as { item: TmdbPayload; type: 'movie' | 'tv' }[];
      const refs = keyed.map((entry) => database.collection('content_overrides').doc(`${entry.type}_${entry.item.id}`));
      const snapshots = refs.length ? await database.getAll(...refs) : [];
      const overrides = new Map(keyed.map((entry, index) => [`${entry.type}_${entry.item.id}`, snapshots[index]?.data()]));
      payload.results = payload.results
        .filter((item: TmdbPayload) => {
          const type = mediaType(endpoint, item);
          return !type || overrides.get(`${type}_${item.id}`)?.visibility !== 'hidden';
        })
        .map((item: TmdbPayload) => {
          const type = mediaType(endpoint, item);
          const override = type ? overrides.get(`${type}_${item.id}`) : undefined;
          return type && override ? mergeOverride(item, override, type) : item;
        });
      return payload;
    }
    const type = mediaType(endpoint, payload);
    if (!type || !payload.id) return payload;
    const override = (await database.collection('content_overrides').doc(`${type}_${payload.id}`).get()).data();
    if (override?.visibility === 'hidden') return { success: false, status_code: 34, status_message: 'Conteúdo indisponível.' };
    return override ? mergeOverride(payload, override, type) : payload;
  } catch {
    return payload;
  }
}

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
    const data = await applyContentOverrides(endpoint, await res.json());
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 });
  }
}
