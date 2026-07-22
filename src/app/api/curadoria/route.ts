import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, rateLimit } from '@/lib/serverAuth';
import { AI_CURATION_ENABLED } from '@/lib/features';

export type Suggestion = {
  title: string;
  year: string;
  type: 'movie' | 'tv';
  reason: string;
};

// ── Gemini helper ──────────────────────────────────────────────
async function callGemini(key: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json',
        },
      }),
    }
  );
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

// ── Keyword fallback for search without AI ─────────────────────
const KEYWORD_MAP: Array<{ kw: string[]; s: Suggestion[] }> = [
  { kw: ['thriller', 'psicológico', 'suspense', 'tenso'],
    s: [
      { title: 'Dark',           year: '2017', type: 'tv',    reason: 'Thriller psicológico alemão com narrativa não-linear e complexa' },
      { title: 'Mindhunter',     year: '2017', type: 'tv',    reason: 'Investigação psicológica profunda de serial killers' },
      { title: 'Gone Girl',      year: '2014', type: 'movie', reason: 'Thriller com reviravoltas que deixam sem fôlego' },
      { title: 'Shutter Island', year: '2010', type: 'movie', reason: 'Mistério psicológico envolvente com final impactante' },
      { title: 'Black Mirror',   year: '2011', type: 'tv',    reason: 'Antologia que explora o lado sombrio da tecnologia' },
    ] },
  { kw: ['maratonar', 'viciante', 'fim de semana'],
    s: [
      { title: 'Breaking Bad',    year: '2008', type: 'tv', reason: 'Uma das séries mais viciantes já produzidas' },
      { title: 'Squid Game',      year: '2021', type: 'tv', reason: 'Fenômeno global impossível de parar de assistir' },
      { title: 'Stranger Things', year: '2016', type: 'tv', reason: 'Aventura nostálgica que prende do início ao fim' },
      { title: 'The Last of Us',  year: '2023', type: 'tv', reason: 'Drama pós-apocalíptico emocionante e intenso' },
      { title: 'Wednesday',       year: '2022', type: 'tv', reason: 'Sobrenatural com humor sombrio, fácil de maratonar' },
    ] },
  { kw: ['comédia', 'rir', 'engraçado', 'humor'],
    s: [
      { title: 'Abbott Elementary',         year: '2021', type: 'tv', reason: 'Comédia escolar que faz rir de verdade' },
      { title: "Schitt's Creek",            year: '2015', type: 'tv', reason: 'Comédia que aquece o coração com personagens adoráveis' },
      { title: 'What We Do in the Shadows', year: '2019', type: 'tv', reason: 'Mockumentary de vampiros com humor absurdo' },
      { title: 'Brooklyn Nine-Nine',        year: '2013', type: 'tv', reason: 'Comédia policial com ótimo elenco e humor consistente' },
      { title: 'The Bear',                  year: '2022', type: 'tv', reason: 'Humor negro intenso em uma cozinha profissional' },
    ] },
  { kw: ['drama', 'familiar', 'família', 'emocionante', 'chorar'],
    s: [
      { title: 'This Is Us',                       year: '2016', type: 'tv',    reason: 'Drama familiar que emociona em cada episódio' },
      { title: 'Succession',                        year: '2018', type: 'tv',    reason: 'Família disfuncional e poder em drama aclamado' },
      { title: 'CODA',                              year: '2021', type: 'movie', reason: 'Drama familiar emocionante, vencedor do Oscar' },
      { title: 'Everything Everywhere All at Once', year: '2022', type: 'movie', reason: 'Sci-fi e drama familiar que surpreende e emociona' },
      { title: 'The Banshees of Inisherin',         year: '2022', type: 'movie', reason: 'Drama humano delicado sobre amizade e perda' },
    ] },
  { kw: ['ficção científica', 'sci-fi', 'espaço', 'futuro'],
    s: [
      { title: 'Severance',    year: '2022', type: 'tv',    reason: 'Ficção científica distópica com narrativa original' },
      { title: 'Andor',        year: '2022', type: 'tv',    reason: 'Sci-fi político profundo no universo Star Wars' },
      { title: 'Interstellar', year: '2014', type: 'movie', reason: 'Épico de sci-fi emocionante e visualmente deslumbrante' },
      { title: 'Arrival',      year: '2016', type: 'movie', reason: 'Ficção científica inteligente e emocionalmente profunda' },
      { title: 'Devs',         year: '2020', type: 'tv',    reason: 'Minissérie de sci-fi filosófica e instigante' },
    ] },
  { kw: ['terror', 'medo', 'horror', 'assustador'],
    s: [
      { title: 'The Haunting of Hill House', year: '2018', type: 'tv',    reason: 'Terror atmosférico e emocionalmente devastador' },
      { title: 'Hereditary',                  year: '2018', type: 'movie', reason: 'Horror psicológico perturbador e impactante' },
      { title: 'The Witch',                   year: '2015', type: 'movie', reason: 'Terror lento e atmosférico sem jump scares vazios' },
      { title: 'Get Out',                     year: '2017', type: 'movie', reason: 'Horror social com crítica poderosa e inteligente' },
      { title: 'Midnight Mass',               year: '2021', type: 'tv',    reason: 'Terror religioso atmosférico e perturbador' },
    ] },
  { kw: ['crime', 'policial', 'detetive', 'investigação'],
    s: [
      { title: 'True Detective', year: '2014', type: 'tv',    reason: 'Crime noir atmosférico com performance icônica' },
      { title: 'Mindhunter',     year: '2017', type: 'tv',    reason: 'Investigação psicológica de serial killers' },
      { title: 'The Wire',       year: '2002', type: 'tv',    reason: 'Drama policial mais aclamado da história da TV' },
      { title: 'Seven',          year: '1995', type: 'movie', reason: 'Thriller policial clássico com final devastador' },
      { title: 'Knives Out',     year: '2019', type: 'movie', reason: 'Mistério de crime moderno inteligente e divertido' },
    ] },
  { kw: ['romance', 'amor', 'relacionamento'],
    s: [
      { title: 'Normal People',        year: '2020', type: 'tv',    reason: 'Romance adulto honesto e emocionalmente intenso' },
      { title: 'Before Sunrise',       year: '1995', type: 'movie', reason: 'Romance íntimo e conversacional, clássico atemporal' },
      { title: 'Fleabag',              year: '2016', type: 'tv',    reason: 'Comédia dramática sobre amor e autoconhecimento' },
      { title: 'Eternal Sunshine',     year: '2004', type: 'movie', reason: 'Sci-fi romântica sobre memória e amor perdido' },
      { title: 'Call Me by Your Name', year: '2017', type: 'movie', reason: 'Romance de verão sensível e emocionante' },
    ] },
];

const DEFAULT_FALLBACK: Suggestion[] = [
  { title: 'Breaking Bad', year: '2008', type: 'tv',    reason: 'Considerada uma das melhores séries de todos os tempos' },
  { title: 'Parasite',     year: '2019', type: 'movie', reason: 'Obra-prima vencedora do Oscar, drama social perfeito' },
  { title: 'Dark',         year: '2017', type: 'tv',    reason: 'Ficção científica alemã com narrativa brilhante' },
  { title: 'The Bear',     year: '2022', type: 'tv',    reason: 'Drama humano intenso sobre paixão e identidade' },
  { title: 'Fleabag',      year: '2016', type: 'tv',    reason: 'Escrita excepcional, premiada e difícil de parar' },
];

// ── Route handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!AI_CURATION_ENABLED) {
    return NextResponse.json({ error: 'feature disabled' }, { status: 503 });
  }
  let body: {
    mode?: string;
    query?: string;
    likedTitles?: Array<{ title: string; rating: number }>;
    filters?: { genres?: string[]; decade?: string; minRating?: number; mediaType?: string };
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { mode, query, likedTitles, filters } = body;
  const key = process.env.GEMINI_API_KEY;

  // The Gemini call costs money — only signed-in users may trigger it, each
  // with a small per-minute budget. Demo mode (no key) costs nothing and
  // stays open.
  if (key) {
    const uid = await verifyIdToken(req.headers.get('authorization'));
    if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!rateLimit(`curadoria:${uid}`, 20, 60_000)) {
      return NextResponse.json({ error: 'rate limited' }, { status: 429 });
    }
  }

  // ── DISCOVER MODE ──────────────────────────────────────────────
  if (mode === 'discover') {
    const { genres = [], decade = 'Qualquer', minRating = 7, mediaType = 'all' } = filters || {};
    const titlesList = (likedTitles as Array<{ title: string; rating: number }> || [])
      .map(t => `"${t.title}" (${t.rating}/10)`)
      .join(', ') || 'nenhum';
    const genreText     = genres.length ? genres.join(', ') : 'variados';
    const decadeText    = decade !== 'Qualquer' ? decade : 'qualquer época';
    const mediaTypeText = mediaType === 'tv' ? 'apenas séries' : mediaType === 'movie' ? 'apenas filmes' : 'filmes e séries';

    if (!key) {
      const allDemos: Suggestion[] = [
        { title: 'Succession',    year: '2018', type: 'tv',    reason: `Drama intenso com ${minRating}+ estrelas, perfeito para ${genreText}` },
        { title: 'The Bear',      year: '2022', type: 'tv',    reason: `Série aclamada dos ${decadeText}, narrativa envolvente` },
        { title: 'Severance',     year: '2022', type: 'tv',    reason: `Original e viciante, avaliação acima de ${minRating}/10` },
        { title: 'Parasite',      year: '2019', type: 'movie', reason: 'Obra-prima com alta tensão e crítica social' },
        { title: 'Fleabag',       year: '2016', type: 'tv',    reason: 'Escrita excepcional, difícil de parar de assistir' },
        { title: 'The Rehearsal', year: '2022', type: 'tv',    reason: `Inovador e instigante, dos mais originais dos ${decadeText}` },
      ];
      const demos = mediaType === 'all' ? allDemos : allDemos.filter(d => d.type === mediaType);
      return NextResponse.json({ suggestions: demos, profile: `Você busca ${mediaTypeText} de ${genreText} com nota mínima de ${minRating} — um gosto refinado.` });
    }

    const system = 'Você é um curador especialista em filmes e séries. Retorne apenas JSON válido conforme o schema solicitado.';
    const prompt = `Perfil do usuário:
- Títulos que amou: ${titlesList}
- Gêneros preferidos: ${genreText}
- Época desejada: ${decadeText}
- Avaliação mínima (TMDB): ${minRating}/10
- Tipo: ${mediaTypeText}

Sugira 6 títulos reais que existem de fato e atendam a esses critérios. Respeite rigorosamente o tipo (${mediaTypeText}). Varie os resultados.

Schema JSON de resposta:
{
  "profile": "string — uma frase sobre o gosto detectado, máx 20 palavras",
  "suggestions": [
    { "title": "string — nome exato em inglês", "year": "string — YYYY", "type": "${mediaType === 'all' ? 'movie | tv' : mediaType}", "reason": "string — por que combina, 1 linha" }
  ]
}`;

    try {
      const text = await callGemini(key, system, prompt);
      const json = JSON.parse(text);
      return NextResponse.json({ suggestions: json.suggestions || [], profile: json.profile || '' });
    } catch {
      return NextResponse.json({ suggestions: [], profile: '' });
    }
  }

  // ── SEARCH MODE ────────────────────────────────────────────────
  if (!key) {
    const lowerQ = (query || '').toLowerCase();
    let suggestions = DEFAULT_FALLBACK;
    for (const { kw, s } of KEYWORD_MAP) {
      if (kw.some(k => lowerQ.includes(k))) { suggestions = s; break; }
    }
    return NextResponse.json({ suggestions });
  }

  const system = 'Você é um curador especialista em filmes e séries. Retorne apenas JSON válido conforme o schema solicitado.';
  const prompt = `O usuário quer assistir: "${query}"

Sugira 5 títulos reais (filmes ou séries que existem) que atendam ao pedido.
Varie muito os resultados a cada chamada — evite sempre sugerir os mesmos títulos óbvios.
Inclua pelo menos 1 título menos conhecido que seja surpreendente.

Schema JSON de resposta:
{
  "suggestions": [
    { "title": "string — nome exato em inglês", "year": "string — YYYY", "type": "movie | tv", "reason": "string — por que atende ao pedido, 1 linha curta" }
  ]
}`;

  try {
    const text = await callGemini(key, system, prompt);
    const json = JSON.parse(text);
    return NextResponse.json({ suggestions: json.suggestions || [] });
  } catch {
    return NextResponse.json({ suggestions: DEFAULT_FALLBACK });
  }
}
