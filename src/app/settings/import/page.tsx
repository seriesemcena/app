'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore, revStore, profileStore, epWatchedStore, type Review } from '@/lib/store';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbListStore, dbRevStore, dbEpWatchedStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
type Status = 'watched' | 'watching' | 'want';

interface ParsedTitle {
  name: string;
  status: Status;
  mediaType: 'tv' | 'movie';
}

interface ImportResult {
  name: string;
  status: Status;
  mediaType: 'tv' | 'movie';
  tmdbId?: number;
  tmdbTitle?: string;
  poster?: string | null;
  matched: boolean;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

interface ParsedReview {
  showName: string;
  mediaType: 'tv' | 'movie';
  text: string;
  rating: number;
  date: string;
}

interface ParsedWatchedEps {
  showName: string;
  episodes: { season: number; ep: number }[];
}

/* ─────────────────────────────────────────────────────────────
   CSV parser — handles quoted fields and CRLF
───────────────────────────────────────────────────────────── */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

/* ─────────────────────────────────────────────────────────────
   TV Time ZIP → { titles, reviews }
───────────────────────────────────────────────────────────── */
async function parseTVTimeZip(file: File): Promise<{ titles: ParsedTitle[]; reviews: ParsedReview[]; watchedEps: ParsedWatchedEps[] }> {
  const zip   = await JSZip.loadAsync(await file.arrayBuffer());
  const files = Object.values(zip.files);
  const titles:     ParsedTitle[]      = [];
  const reviews:    ParsedReview[]     = [];
  const watchedEps: ParsedWatchedEps[] = [];

  // ── TV shows from user_tv_show_data.csv ──────────────────
  const showFile = files.find((f) => f.name.toLowerCase().includes('user_tv_show_data') && !f.dir);
  if (showFile) {
    const rows = parseCSV(await showFile.async('string'));
    for (const row of rows) {
      const name = (row['tv_show_name'] || '').trim();
      if (!name) continue;
      const followed = row['is_followed'] === '1';
      const seen     = parseInt(row['nb_episodes_seen'] || '0', 10);
      let status: Status;
      if (followed && seen > 0)        status = 'watching';
      else if (followed)               status = 'want';
      else if (!followed && seen > 0)  status = 'watched';
      else continue;
      titles.push({ name, status, mediaType: 'tv' });
    }
  }

  // ── Movies from tracking-prod-records.csv (not v2) ───────
  // The summary row (count-watch-movie) lists watched UUIDs in `watches`.
  // Individual movie rows have `movie_name` and `uuid` but empty `watch_count`.
  const trackFile = files.find((f) => {
    const n = f.name.toLowerCase();
    return n.endsWith('tracking-prod-records.csv') && !f.dir;
  });
  if (trackFile) {
    const rows = parseCSV(await trackFile.async('string'));

    // Collect watched movie UUIDs from the summary row
    const watchedUUIDs = new Set<string>();
    const summaryRow = rows.find((r) => (r['type-uuid-n'] || '').startsWith('count-watch-movie'));
    if (summaryRow) {
      const raw = (summaryRow['watches'] || '').replace(/^\[/, '').replace(/\]$/, '');
      raw.split(',').forEach((u) => { const t = u.trim(); if (t) watchedUUIDs.add(t); });
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const name = (row['movie_name'] || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const uuid   = (row['uuid'] || '').trim();
      const status: Status = watchedUUIDs.has(uuid) ? 'watched' : 'want';
      titles.push({ name, status, mediaType: 'movie' });
    }
  }

  // ── Episode comments → show reviews ──────────────────────
  // episode_comment.csv: tv_show_name, comment, created_at, episode_season_number, episode_number
  const commentFile = files.find((f) => f.name.toLowerCase().includes('episode_comment') && !f.dir);
  const reviewsByShow = new Map<string, ParsedReview>();
  if (commentFile) {
    const rows = parseCSV(await commentFile.async('string'));
    for (const row of rows) {
      const show = (row['tv_show_name'] || '').trim();
      const text = (row['comment'] || '').trim();
      if (!show || !text) continue;
      const existing = reviewsByShow.get(show);
      if (!existing) {
        reviewsByShow.set(show, { showName: show, mediaType: 'tv', text, rating: 0, date: row['created_at'] || new Date().toISOString() });
      } else if (!existing.text) {
        existing.text = text;
      }
    }
  }

  // ── Episode ratings → merge with reviews ─────────────────
  // vote_key format: {episode_id}-{user_id}-{vote}   (vote is the rating value)
  const ratingFile = files.find((f) => f.name.toLowerCase().includes('ratings-3-prod-episode_votes') && !f.dir);
  if (ratingFile) {
    const rows = parseCSV(await ratingFile.async('string'));
    for (const row of rows) {
      const show    = (row['series_name'] || '').trim();
      const voteKey = (row['vote_key']    || '').trim();
      if (!show || !voteKey) continue;
      const parts  = voteKey.split('-');
      const rating = parseInt(parts[parts.length - 1], 10) || 0;
      const existing = reviewsByShow.get(show);
      if (existing) {
        existing.rating = rating;
      } else {
        reviewsByShow.set(show, { showName: show, mediaType: 'tv', text: '', rating, date: new Date().toISOString() });
      }
    }
  }

  // Only include reviews that have at least text or a rating
  for (const rev of reviewsByShow.values()) {
    if (rev.text || rev.rating > 0) reviews.push(rev);
  }

  // ── Watched episodes from tracking-prod-records-v2.csv ───
  // watch-episode-* rows have series_name, season_number, episode_number
  const v2File = files.find((f) => {
    const n = f.name.toLowerCase();
    return n.includes('tracking-prod-records-v2') && !f.dir;
  });
  if (v2File) {
    const rows = parseCSV(await v2File.async('string'));
    const byShow = new Map<string, { season: number; ep: number }[]>();
    for (const row of rows) {
      const key = (row['key'] || '').trim();
      if (!key.startsWith('watch-episode-')) continue;
      const show  = (row['series_name'] || '').trim();
      const sNo   = parseInt(row['season_number'] || row['s_no'] || '0', 10);
      const epNo  = parseInt(row['episode_number'] || row['ep_no'] || '0', 10);
      if (!show || !sNo || !epNo) continue;
      if (!byShow.has(show)) byShow.set(show, []);
      byShow.get(show)!.push({ season: sNo, ep: epNo });
    }
    for (const [showName, episodes] of byShow) {
      watchedEps.push({ showName, episodes });
    }
  }

  return { titles, reviews, watchedEps };
}

/* ─────────────────────────────────────────────────────────────
   TMDB search + match
   Strategy:
     1. Strip "(YYYY)" from name, use year as a separate param
     2. If no hit, retry without year constraint
───────────────────────────────────────────────────────────── */
async function searchTMDB(title: ParsedTitle): Promise<ImportResult> {
  // Extract year from names like "Paradise (2025)"
  const yearMatch = title.name.match(/\((\d{4})\)\s*$/);
  const year      = yearMatch ? yearMatch[1] : null;
  const cleanName = title.name.replace(/\s*\(\d{4}\)\s*$/, '').trim();

  const type    = title.mediaType === 'movie' ? 'movie' : 'tv';
  const yearKey = type === 'tv' ? 'first_air_date_year' : 'year';

  const trySearch = async (name: string, withYear: boolean): Promise<{ id: number; title?: string; name?: string; poster_path?: string } | null> => {
    const q      = encodeURIComponent(name);
    const yrPart = withYear && year ? `&${yearKey}=${year}` : '';
    const res    = await fetch(`/api/tmdb?endpoint=/search/${type}&query=${q}${yrPart}`);
    const data   = await res.json();
    return data?.results?.[0] ?? null;
  };

  try {
    // Attempt 1: clean name + year
    let hit = await trySearch(cleanName, true);
    // Attempt 2: clean name without year constraint
    if (!hit) hit = await trySearch(cleanName, false);
    // Attempt 3: original name (fallback for names without year suffix)
    if (!hit && cleanName !== title.name) hit = await trySearch(title.name, false);

    if (!hit) throw new Error('not found');
    return {
      name: title.name, status: title.status, mediaType: title.mediaType,
      tmdbId: hit.id, tmdbTitle: hit.title || hit.name, poster: hit.poster_path,
      matched: true,
    };
  } catch {
    return { name: title.name, status: title.status, mediaType: title.mediaType, matched: false };
  }
}

/* ─────────────────────────────────────────────────────────────
   Circular progress ring
───────────────────────────────────────────────────────────── */
function ProgressRing({ pct }: { pct: number }) {
  const r = 38, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 96, height: 96 }}>
      <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
        <circle
          cx={48} cy={48} r={r} fill="none"
          stroke={T.pink} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={20} weight={900} color={T.t1}>{pct}%</Txt>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────── */
export default function ImportPage() {
  const router   = useRouter();
  const { user } = useAuth();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [step,             setStep]            = useState<Step>('upload');
  const [parsed,           setParsed]          = useState<ParsedTitle[]>([]);
  const [parsedReviews,    setParsedReviews]   = useState<ParsedReview[]>([]);
  const [parsedEps,        setParsedEps]       = useState<ParsedWatchedEps[]>([]);
  const [results,          setResults]         = useState<ImportResult[]>([]);
  const [progress,         setProgress]        = useState(0);
  const [current,          setCurrent]         = useState('');
  const [fileErr,          setFileErr]         = useState('');
  const [importedReviews,  setImportedReviews] = useState(0);

  /* ── File upload handler ── */
  const handleFile = async (file: File) => {
    setFileErr('');
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setFileErr('Selecione o arquivo .zip exportado pelo TV Time.');
      return;
    }
    try {
      const { titles, reviews, watchedEps } = await parseTVTimeZip(file);
      if (titles.length === 0) {
        setFileErr('Não encontramos títulos no arquivo. Verifique se é o export correto do TV Time (GDPR).');
        return;
      }
      setParsed(titles);
      setParsedReviews(reviews);
      setParsedEps(watchedEps);
      setStep('preview');
    } catch {
      setFileErr('Erro ao ler o arquivo. Verifique se é um .zip válido do TV Time.');
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  /* ── Run import ── */
  const runImport = async () => {
    setStep('importing');
    setProgress(0);
    const out: ImportResult[] = [];
    const BATCH = 3;

    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH);
      setCurrent(batch[0].name);
      const batchResults = await Promise.all(batch.map(searchTMDB));
      out.push(...batchResults);

      for (const r of batchResults) {
        if (!r.matched || !r.tmdbId) continue;
        const listType = r.status;
        const item = { id: r.tmdbId, title: r.tmdbTitle || r.name, type: r.mediaType, poster_path: r.poster ?? null };
        listStore.add(listType, item);
        if (firebaseConfigured && user) {
          try { await dbListStore.add(getDB(), user.uid, listType, item); } catch {}
        }
      }

      setProgress(Math.min(Math.round(((i + BATCH) / parsed.length) * 100), 100));
      await new Promise((res) => setTimeout(res, 80));
    }

    // ── Helper: resolve TMDB id by show name ─────────────────
    // Looks in current import results first, then falls back to
    // the user's existing lists (handles re-imports & partial matches).
    const resolveTmdbId = (showName: string, mediaType: 'tv' | 'movie'): { tmdbId: number; mediaType: 'tv' | 'movie' } | null => {
      const nameLower = showName.toLowerCase().trim();
      const fromOut = out.find(
        (r) => r.matched && r.tmdbId &&
        r.name.toLowerCase().trim() === nameLower &&
        r.mediaType === mediaType
      );
      if (fromOut?.tmdbId) return { tmdbId: fromOut.tmdbId, mediaType };

      // Fallback: search existing lists
      for (const listType of ['watched', 'watching', 'want', 'favorites'] as const) {
        const item = listStore.get(listType).find(
          (i) => i.title.toLowerCase().trim() === nameLower && i.type === mediaType
        );
        if (item) return { tmdbId: item.id, mediaType };
      }
      return null;
    };

    // ── Save reviews ──────────────────────────────────────────
    let savedReviews = 0;
    if (parsedReviews.length > 0) {
      const profile = profileStore.get(user?.uid);
      const displayName = profile.name || profile.username || user?.displayName || user?.email?.split('@')[0] || 'eu';
      const avatarLetter = profile.avatarLetter || displayName[0]?.toUpperCase() || '?';
      const photoUrl = profile.avatarImage || user?.photoURL || '';
      for (const pr of parsedReviews) {
        const resolved = resolveTmdbId(pr.showName, pr.mediaType);
        if (!resolved) continue;
        const titleKey = `${resolved.mediaType === 'movie' ? 'movie' : 'tv'}_${resolved.tmdbId}`;
        const review: Review = {
          id: `tvtime_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          user: displayName,
          avatar: avatarLetter,
          photoUrl,
          rating: pr.rating,
          text: pr.text,
          date: pr.date,
          likes: 0,
          likedBy: [],
        };
        revStore.addReview(titleKey, review);
        if (firebaseConfigured && user) {
          try { await dbRevStore.add(getDB(), titleKey, review); } catch {}
        }
        savedReviews++;
      }
    }
    setImportedReviews(savedReviews);

    // ── Save watched episodes ─────────────────────────────────
    for (const pe of parsedEps) {
      const resolved = resolveTmdbId(pe.showName, 'tv');
      if (!resolved) continue;
      const bySeasonMap: Record<string, number[]> = {};
      for (const { season, ep } of pe.episodes) {
        const s = String(season);
        if (!bySeasonMap[s]) bySeasonMap[s] = [];
        if (!bySeasonMap[s].includes(ep)) bySeasonMap[s].push(ep);
      }
      epWatchedStore.setShow(resolved.tmdbId, bySeasonMap);
    }
    if (firebaseConfigured && user) {
      try { await dbEpWatchedStore.set(getDB(), user.uid, epWatchedStore.getAll()); } catch {}
    }

    setResults(out);
    setStep('done');
  };

  const matched   = results.filter((r) => r.matched);
  const unmatched = results.filter((r) => !r.matched);

  /* ─── Step: Upload ─── */
  if (step === 'upload') return (
    <Frame>
      <Screen>
        <HeaderBar title="Importar do TV Time" onBack={() => router.back()} />
        <ScrollArea style={{ padding: '0 16px 32px' }}>

          <div style={{ textAlign: 'center', padding: '32px 16px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg,#e84393,#ff6d3a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="tv" size={34} color="#fff" />
            </div>
            <Txt size={20} weight={900} color={T.t1} style={{ display: 'block', marginBottom: 8 }}>TV Time → Maratonou</Txt>
            <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>
              Importe seu histórico de séries e filmes do TV Time sem perder nada.
            </Txt>
          </div>

          {/* Steps */}
          <div style={{ background: T.card, borderRadius: 18, border: `1px solid ${T.border}`, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
              <Txt size={12} weight={800} color={T.t2} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Como exportar do TV Time</Txt>
            </div>
            {[
              { n: '1', text: 'Acesse tvtime.com no navegador e entre na sua conta' },
              { n: '2', text: 'Vá em Configurações → Conta → Privacidade dos dados' },
              { n: '3', text: 'Clique em "Exportar meus dados (GDPR)" e aguarde o e-mail' },
              { n: '4', text: 'Abra o e-mail, baixe o arquivo .zip e faça upload abaixo' },
            ].map(({ n, text }, i, arr) => (
              <div key={n} style={{ padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Txt size={11} weight={900} color="#fff">{n}</Txt>
                </div>
                <Txt size={13} color={T.t2} style={{ lineHeight: 1.5 }}>{text}</Txt>
              </div>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              border: `2px dashed ${fileErr ? T.red : T.border}`,
              borderRadius: 18, padding: '36px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              cursor: 'pointer', background: T.card,
              transition: 'border-color 0.2s',
            }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(192,105,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={24} color={T.pink} />
            </div>
            <Txt size={14} weight={700} color={T.t1}>Selecionar arquivo .zip</Txt>
            <Txt size={12} color={T.t3}>ou arraste e solte aqui</Txt>
            {fileErr && <Txt size={12} color={T.red} style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>{fileErr}</Txt>}
          </div>
          <input ref={fileRef} type="file" accept=".zip" onChange={onFilePick} style={{ display: 'none' }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16, padding: '12px 14px', background: 'rgba(245,197,24,0.07)', borderRadius: 12, border: '1px solid rgba(245,197,24,0.18)' }}>
            <Icon name="info" size={16} color={T.gold} style={{ flexShrink: 0, marginTop: 1 }} />
            <Txt size={12} color={T.t2} style={{ lineHeight: 1.5 }}>
              Seus dados não são enviados a nenhum servidor. O processamento acontece inteiramente no seu dispositivo.
            </Txt>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );

  /* ─── Step: Preview ─── */
  if (step === 'preview') {
    const watchedC  = parsed.filter((p) => p.status === 'watched').length;
    const watchingC = parsed.filter((p) => p.status === 'watching').length;
    const wantC     = parsed.filter((p) => p.status === 'want').length;
    const moviesC   = parsed.filter((p) => p.mediaType === 'movie').length;
    const tvC       = parsed.filter((p) => p.mediaType === 'tv').length;

    return (
      <Frame>
        <Screen>
          <HeaderBar title="Prévia da importação" onBack={() => setStep('upload')} />
          <ScrollArea style={{ padding: '0 16px 32px' }}>

            <div style={{ textAlign: 'center', padding: '28px 16px 24px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(52,199,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Icon name="check" size={30} color="#34c759" />
              </div>
              <Txt size={19} weight={900} color={T.t1} style={{ display: 'block', marginBottom: 6 }}>
                {parsed.length} título{parsed.length !== 1 ? 's' : ''} encontrado{parsed.length !== 1 ? 's' : ''}
              </Txt>
              <Txt size={13} color={T.t3}>Confirme antes de importar</Txt>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { value: watchedC,  label: 'Assistidos',  color: T.pink },
                { value: watchingC, label: 'Assistindo',  color: '#60a5fa' },
                { value: wantC,     label: 'Quero ver',   color: T.gold },
                { value: tvC,       label: 'Séries',      color: '#a78bfa' },
                { value: moviesC,   label: 'Filmes',      color: '#f97316' },
              ].filter((s) => s.value > 0).map(({ value, label, color }) => (
                <div key={label} style={{ padding: '14px 16px', background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                  <div>
                    <Txt size={20} weight={900} color={T.t1} style={{ display: 'block', lineHeight: 1 }}>{value}</Txt>
                    <Txt size={11} color={T.t3}>{label}</Txt>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: T.card, borderRadius: 18, border: `1px solid ${T.border}`, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
                <Txt size={12} weight={800} color={T.t2} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Títulos detectados</Txt>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {parsed.slice(0, 30).map((p, i) => (
                  <div key={i} style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < Math.min(parsed.length, 30) - 1 ? `1px solid ${T.border}` : 'none' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: p.mediaType === 'movie' ? '#f97316' : '#a78bfa' }} />
                    <Txt size={13} color={T.t1} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Txt>
                    <StatusPill status={p.status} />
                  </div>
                ))}
                {parsed.length > 30 && (
                  <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <Txt size={12} color={T.t3}>+ {parsed.length - 30} outros títulos</Txt>
                  </div>
                )}
              </div>
            </div>

            {parsedReviews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(52,199,89,0.07)', borderRadius: 12, border: '1px solid rgba(52,199,89,0.2)', marginBottom: 12 }}>
                <Icon name="star" size={16} color="#34c759" style={{ flexShrink: 0, marginTop: 1 }} />
                <Txt size={12} color={T.t2} style={{ lineHeight: 1.5 }}>
                  {parsedReviews.length} avaliação{parsedReviews.length !== 1 ? 'ões' : ''} e comentário{parsedReviews.length !== 1 ? 's' : ''} encontrado{parsedReviews.length !== 1 ? 's' : ''} — serão importados junto com as listas.
                </Txt>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, padding: '12px 14px', background: 'rgba(96,165,250,0.07)', borderRadius: 12, border: '1px solid rgba(96,165,250,0.2)', marginBottom: 24 }}>
              <Icon name="info" size={16} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }} />
              <Txt size={12} color={T.t2} style={{ lineHeight: 1.5 }}>
                Títulos já nas suas listas não serão duplicados. O matching usa o TMDB, ~85% de precisão — você poderá ver o que não foi encontrado no final.
              </Txt>
            </div>

            <button
              onClick={runImport}
              style={{
                width: '100%', padding: '16px 0', borderRadius: 50,
                background: T.pink, border: 'none', cursor: 'pointer',
                fontFamily: "'Area','Inter',sans-serif", fontSize: 15, fontWeight: 700, color: '#fff',
              }}
            >
              Importar {parsed.length} título{parsed.length !== 1 ? 's' : ''}
            </button>
          </ScrollArea>
        </Screen>
      </Frame>
    );
  }

  /* ─── Step: Importing ─── */
  if (step === 'importing') return (
    <Frame>
      <Screen>
        <HeaderBar title="Importando..." onBack={() => {}} hideBack />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24 }}>
          <ProgressRing pct={progress} />
          <div style={{ textAlign: 'center' }}>
            <Txt size={16} weight={700} color={T.t1} style={{ display: 'block', marginBottom: 6 }}>Buscando no TMDB...</Txt>
            <Txt size={12} color={T.t3} style={{ display: 'block', maxWidth: 240, lineHeight: 1.5 }}>
              {current ? `Procurando "${current}"` : 'Preparando importação'}
            </Txt>
          </div>
          <Txt size={12} color={T.t4} style={{ textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
            Não feche esta tela. A importação pode levar alguns segundos.
          </Txt>
        </div>
      </Screen>
    </Frame>
  );

  /* ─── Step: Done ─── */
  return (
    <Frame>
      <Screen>
        <HeaderBar title="Importação concluída" onBack={() => router.push('/settings')} />
        <ScrollArea style={{ padding: '0 16px 32px' }}>

          <div style={{ textAlign: 'center', padding: '32px 16px 28px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: 'rgba(52,199,89,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={32} color="#34c759" />
            </div>
            <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', marginBottom: 8 }}>Pronto!</Txt>
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <Txt size={36} weight={900} color="#34c759" style={{ display: 'block', lineHeight: 1 }}>{matched.length}</Txt>
                <Txt size={11} color={T.t3}>importados</Txt>
              </div>
              {unmatched.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <Txt size={36} weight={900} color={T.gold} style={{ display: 'block', lineHeight: 1 }}>{unmatched.length}</Txt>
                  <Txt size={11} color={T.t3}>não encontrados</Txt>
                </div>
              )}
              {importedReviews > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <Txt size={36} weight={900} color="#60a5fa" style={{ display: 'block', lineHeight: 1 }}>{importedReviews}</Txt>
                  <Txt size={11} color={T.t3}>avaliações</Txt>
                </div>
              )}
            </div>
          </div>

          {matched.length > 0 && (
            <div style={{ background: T.card, borderRadius: 18, border: `1px solid ${T.border}`, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: '#34c759' }} />
                <Txt size={12} weight={800} color={T.t2} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  {matched.length} importados com sucesso
                </Txt>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {matched.map((r, i) => (
                  <div key={i} style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < matched.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                    {r.poster
                      ? <img src={`https://image.tmdb.org/t/p/w92${r.poster}`} alt="" style={{ width: 28, height: 42, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 28, height: 42, borderRadius: 5, background: T.surface2, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <Txt size={13} weight={600} color={T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.tmdbTitle || r.name}
                      </Txt>
                      <Txt size={11} color={T.t3}>{r.mediaType === 'movie' ? 'Filme' : 'Série'}</Txt>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div style={{ background: T.card, borderRadius: 18, border: `1px solid rgba(245,197,24,0.2)`, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: T.gold }} />
                <Txt size={12} weight={800} color={T.t2} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  {unmatched.length} não encontrados
                </Txt>
              </div>
              <div style={{ padding: '10px 16px 14px' }}>
                <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 10, lineHeight: 1.5 }}>
                  Esses títulos podem ter nomes diferentes no TMDB. Adicione-os manualmente pela busca.
                </Txt>
                {unmatched.map((r, i) => (
                  <div key={i} style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 8, borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <Icon name="close" size={13} color={T.gold} />
                    <Txt size={13} color={T.t2}>{r.name}</Txt>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => router.push('/profile')}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 50,
              background: T.pink, border: 'none', cursor: 'pointer',
              fontFamily: "'Area','Inter',sans-serif", fontSize: 15, fontWeight: 700, color: '#fff',
              marginBottom: 12,
            }}
          >
            Ver meu perfil
          </button>
          <button
            onClick={() => router.push('/search')}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 50,
              background: 'transparent', border: `1px solid ${T.border}`, cursor: 'pointer',
              fontFamily: "'Area','Inter',sans-serif", fontSize: 14, fontWeight: 600, color: T.t2,
            }}
          >
            Buscar títulos não encontrados
          </button>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}

/* ── Shared sub-components ── */
function HeaderBar({ title, onBack, hideBack }: { title: string; onBack: () => void; hideBack?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '52px 16px 14px', flexShrink: 0,
      borderBottom: `1px solid ${T.border}`,
    }}>
      {!hideBack && (
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(255,255,255,0.09)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          } as React.CSSProperties}
        >
          <Icon name="chevronL" size={17} color={T.t1} />
        </button>
      )}
      <Txt size={18} weight={800} color={T.t1}>{title}</Txt>
    </div>
  );
}

const STATUS_LABELS: Record<Status, { label: string; color: string; bg: string }> = {
  watched:  { label: 'Assistido',  color: T.pink,    bg: 'rgba(192,105,255,0.12)' },
  watching: { label: 'Assistindo', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  want:     { label: 'Quero ver',  color: T.gold,    bg: 'rgba(245,197,24,0.12)'  },
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS_LABELS[status];
  return (
    <div style={{ padding: '3px 9px', borderRadius: 20, background: s.bg, flexShrink: 0 }}>
      <Txt size={10} weight={700} color={s.color}>{s.label}</Txt>
    </div>
  );
}
