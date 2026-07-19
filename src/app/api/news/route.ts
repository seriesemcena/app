import { NextRequest, NextResponse } from 'next/server';

const WP_BASE = 'https://seriesemcena.com.br/wp-json/wp/v2';

function decodeHtml(str: string) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/\[&hellip;\]/g, '…')
    .replace(/&#8230;/g, '…')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .trim();
}

function localNewsImage(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['seriesemcena.com.br', 'www.seriesemcena.com.br'].includes(url.hostname)) return value;
    return `/api/news-image?path=${encodeURIComponent(url.pathname)}`;
  } catch {
    return null;
  }
}

async function resolveTermId(type: 'categories' | 'tags', slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${WP_BASE}/${type}?slug=${encodeURIComponent(slug)}&per_page=1`, {
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0].id : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get('category'); // e.g. "series", "filmes"
  const tag      = searchParams.get('tag');      // e.g. "doramas"

  try {
    let postsUrl = `${WP_BASE}/posts?per_page=20&_embed=1&orderby=date&order=desc`;

    if (category) {
      const id = await resolveTermId('categories', category);
      if (id) postsUrl += `&categories=${id}`;
    } else if (tag) {
      const id = await resolveTermId('tags', tag);
      if (id) postsUrl += `&tags=${id}`;
    }
    // Default (Destaques) — no filter, just latest posts

    const postsRes = await fetch(postsUrl, { next: { revalidate: 300 } });
    const rawPosts = await postsRes.json();

    if (!Array.isArray(rawPosts)) {
      return NextResponse.json({ error: 'Unexpected response from WordPress' }, { status: 502 });
    }

    const posts = rawPosts.map((p: any) => {
      const media = p._embedded?.['wp:featuredmedia']?.[0];
      const sourceImage: string | null =
        media?.media_details?.sizes?.medium_large?.source_url ||
        media?.media_details?.sizes?.medium?.source_url ||
        media?.source_url ||
        null;

      return {
        id:      p.id as number,
        title:   decodeHtml(p.title?.rendered ?? ''),
        image:   localNewsImage(sourceImage),
        link:    p.link as string,
        date:    p.date as string,
      };
    });

    return NextResponse.json(posts);
  } catch (err) {
    console.error('[/api/news]', err);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
