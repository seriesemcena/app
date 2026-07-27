import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  const q   = req.nextUrl.searchParams.get('q')?.trim() || '';
  // Clamp to a number — raw interpolation let "15&rating=r" smuggle params
  // into the upstream URL and override the family-friendly rating=g filter.
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '15', 10) || 15));

  if (!key) return NextResponse.json({ data: [] });

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g&lang=pt`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limit}&rating=g`;

  try {
    const res  = await fetch(endpoint, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Giphy responded with ${res.status}`);
    const json = await res.json();
    const data = Array.isArray(json?.data)
      ? json.data.flatMap((gif: {
          id?: unknown;
          title?: unknown;
          images?: {
            fixed_height_small?: {
              url?: unknown;
              webp?: unknown;
              width?: unknown;
              height?: unknown;
            };
          };
        }) => {
          const image = gif.images?.fixed_height_small;
          if (typeof gif.id !== 'string' || !image) return [];
          const url = typeof image.url === 'string' ? image.url : '';
          const webp = typeof image.webp === 'string' ? image.webp : '';
          if (!url && !webp) return [];
          return [{
            id: gif.id,
            title: typeof gif.title === 'string' ? gif.title : '',
            images: {
              fixed_height_small: {
                url,
                webp,
                width: typeof image.width === 'string' ? image.width : '',
                height: typeof image.height === 'string' ? image.height : '',
              },
            },
          }];
        })
      : [];
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ data: [] });
  }
}
