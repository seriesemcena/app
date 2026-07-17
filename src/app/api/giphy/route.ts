import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key   = process.env.GIPHY_API_KEY;
  const q     = req.nextUrl.searchParams.get('q')?.trim() || '';
  const limit = req.nextUrl.searchParams.get('limit') || '15';

  if (!key) return NextResponse.json({ data: [] });

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&rating=g&lang=pt`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limit}&rating=g`;

  try {
    const res  = await fetch(endpoint, { next: { revalidate: 60 } });
    const json = await res.json();
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ data: [] });
  }
}
