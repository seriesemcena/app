import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, rateLimit } from '@/lib/serverAuth';

export async function POST(req: NextRequest) {
  let body: { prompt?: string; metrics?: { genre?: string; minRating?: number; lang?: string; decade?: string } };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { prompt, metrics } = body;
  const key = process.env.ANTHROPIC_API_KEY;

  // The Claude call costs money — require a signed-in user and rate limit.
  // Demo mode (no key) costs nothing and stays open.
  if (key) {
    const uid = await verifyIdToken(req.headers.get('authorization'));
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!rateLimit(`ai:${uid}`, 15, 60_000)) {
      return NextResponse.json({ error: 'rate limited' }, { status: 429 });
    }
  }

  const systemContext = `Você é um assistente especialista em filmes e séries para o app "Séries em Cena". Responda SEMPRE em português brasileiro. Gênero favorito: ${metrics?.genre || 'Drama'}. Nota mínima: ${metrics?.minRating || 7}/10. Idioma: ${metrics?.lang || 'Qualquer'}. Década: ${metrics?.decade || 'Qualquer'}. Sugira 3-5 títulos com nome, ano e motivo. Seja entusiasta, conciso e use emojis com moderação.`;

  if (!key) {
    return NextResponse.json({
      reply: `Modo demo (sem ANTHROPIC_API_KEY configurada).\n\nCom base no que você disse — "${prompt}" — eu sugeriria explorar:\n\n🎬 **Drive (2011)** — atmosfera, neon e silêncio.\n🎬 **Whiplash (2014)** — tensão e obsessão pela perfeição.\n📺 **Better Call Saul** — drama jurídico magistral.\n\nConfigure ANTHROPIC_API_KEY em .env.local para respostas reais geradas por IA.`,
    });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemContext,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || 'Não consegui gerar uma resposta.';
    return NextResponse.json({ reply: text });
  } catch {
    return NextResponse.json({ reply: 'Erro ao consultar a IA. Tente novamente.' }, { status: 502 });
  }
}
