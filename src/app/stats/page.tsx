'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { listStore, revStore, prefsStore, epWatchedStore, profileStore } from '@/lib/store';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbUserStatsStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { navigateBack } from '@/lib/navigation';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import '@/lib/i18n';
import { tmdbImg } from '@/lib/tmdb';

const GENRE_COLORS: Record<string, string> = {
  'Drama':'#C069FF','Ação':'#FF6B2B','Action':'#FF6B2B','Comédia':'#F5C518','Comedy':'#F5C518',
  'Ficção científica':'#3b82f6','Ficção Científica':'#3b82f6','Science Fiction':'#3b82f6','Sci-Fi':'#3b82f6',
  'Terror':'#8b5cf6','Horror':'#8b5cf6','Romance':'#ec4899','Thriller':'#ef4444',
  'Documentário':'#10b981','Documentary':'#10b981','Animação':'#f97316','Animation':'#f97316',
  'Crime':'#6366f1','Aventura':'#06b6d4','Adventure':'#06b6d4','Família':'#f59e0b','Family':'#f59e0b',
  'Mistério':'#7c3aed','Mystery':'#7c3aed','Western':'#a16207','Guerra':'#dc2626','War':'#dc2626',
};
const DONUT_COLORS = ['#C069FF', '#FF6B2B', '#3b82f6', '#F5C518', '#10b981'];
const getMonthShort = (date: Date) =>
  new Intl.DateTimeFormat(i18next.language || 'pt-BR', { month: 'short' }).format(date).replace('.', '');

function timeParts(totalMins: number) {
  const months = Math.floor(totalMins / (60 * 24 * 30));
  const days   = Math.floor((totalMins % (60 * 24 * 30)) / (60 * 24));
  const hours  = Math.floor((totalMins % (60 * 24)) / 60);
  return { months, days, hours };
}

function last7DateLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels.push(String(d.getDate()));
  }
  return labels;
}

/* ── StatCard ────────────────────────────────────────────────── */
function StatCard({ children, style, padding }: { children: React.ReactNode; style?: React.CSSProperties; padding?: string | number }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <div style={{ background: isDark ? '#141416' : 'var(--c-card)', borderRadius: 20, border: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid var(--c-border)', margin: '10px 16px 0', padding: padding ?? '18px 16px', position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'} 1px, transparent 1px)`, backgroundSize: '18px 18px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

/* ── DayBarChart ─────────────────────────────────────────────── */
function DayBarChart({ data, labels, unit, barColor = '#22c55e', todayColor = '#C069FF', isDark = true }: {
  data: number[]; labels: string[]; unit: string; barColor?: string; todayColor?: string; isDark?: boolean;
}) {
  const max = Math.max(...data, 1);
  const [anim, setAnim] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnim(true), 300); return () => clearTimeout(t); }, []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
        {data.map((val, i) => {
          const pct = val / max;
          const isToday = i === data.length - 1;
          const color = isToday ? todayColor : val > 0 ? barColor : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)');
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
              {val > 0 && (
                <Txt size={9} weight={700} color={isToday ? todayColor : barColor} style={{ lineHeight: 1 }}>
                  {Number.isInteger(val) ? val : val.toFixed(1)}
                </Txt>
              )}
              <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: anim && val > 0 ? `${Math.max(pct * 100, 6)}%` : val > 0 ? '6%' : '3%', borderRadius: 4, background: color, transition: `height 0.55s cubic-bezier(0.16,1,0.3,1) ${i * 35}ms` }} />
              </div>
              <Txt size={9} weight={isToday ? 700 : 400} color={isToday ? todayColor : T.t4}>{labels[i]}</Txt>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <Txt size={9} weight={700} color={T.t4} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{i18next.t('statsPage.perWeekUnit', { ns: 'home', unit })}</Txt>
      </div>
    </div>
  );
}

/* ── MultiSegmentDonut ───────────────────────────────────────── */
function MultiSegmentDonut({ segments, centerLabel, isDark = true }: {
  segments: Array<{ pct: number; color: string; label: string }>;
  centerLabel: string;
  isDark?: boolean;
}) {
  const r = 36, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t); }, []);
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <svg width={110} height={110} viewBox="0 0 100 100">
        <g style={{ transform: 'rotate(-90deg)', transformOrigin: '50px 50px' } as React.CSSProperties}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} strokeWidth={10} />
          {segments.map((seg, i) => {
            const segLen = circ * seg.pct / 100;
            const gapLen = segments.length > 1 ? 2 : 0;
            const displayLen = animated ? Math.max(segLen - gapLen, 0) : 0;
            const offset = circ - acc;
            acc += segLen;
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={seg.color} strokeWidth={10}
                strokeDasharray={`${displayLen} ${circ}`}
                strokeDashoffset={offset}
                style={{ transition: `stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms` }}
              />
            );
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <Txt size={8} weight={700} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)'} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{i18next.t('statsPage.topGenreCenter', { ns: 'home' })}</Txt>
        <Txt size={10} weight={800} color={T.t1} style={{ textAlign: 'center', lineHeight: 1.2, marginTop: 2, maxWidth: 56 }}>{centerLabel}</Txt>
      </div>
    </div>
  );
}

/* ── RatingDistribution ──────────────────────────────────────── */
function RatingDistribution({ dist, isDark = true }: { dist: number[]; isDark?: boolean }) {
  const max = Math.max(...dist, 1);
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 250); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {[5, 4, 3, 2, 1].map((star, i) => {
        const count = dist[star - 1] ?? 0;
        const pct = (count / max) * 100;
        return (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Txt size={11} weight={700} color={T.t2} style={{ width: 22, textAlign: 'right', flexShrink: 0 }}>{star}★</Txt>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #FF6B2B, #f59e0b)', width: animated ? `${pct}%` : '0%', transition: `width 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 60}ms` }} />
            </div>
            <Txt size={11} weight={600} color={T.t3} style={{ width: 18, flexShrink: 0 }}>{count}</Txt>
          </div>
        );
      })}
    </div>
  );
}

/* ── MonthlyLineChart ────────────────────────────────────────── */
function MonthlyLineChart({ data, isDark = true }: { data: Array<{ label: string; hours: number }>; isDark?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length < 2) return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Txt size={12} color={T.t3}>{i18next.t('statsPage.watchMoreHistory', { ns: 'home' })}</Txt>
    </div>
  );

  const W = 300, H = 90;
  const PAD = { l: 26, r: 8, t: 18, b: 20 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const rawMax = Math.max(...data.map(d => d.hours), 1);
  const yMax   = Math.ceil(rawMax / 3) * 3 || 12;
  const step   = yMax <= 6 ? 2 : yMax <= 12 ? 3 : Math.ceil(yMax / 4);
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);

  const xOf = (i: number) => PAD.l + (i / (data.length - 1)) * cW;
  const yOf = (h: number) => PAD.t + (1 - h / yMax) * cH;

  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(d.hours).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${xOf(data.length - 1).toFixed(1)} ${(PAD.t + cH).toFixed(1)} L ${xOf(0).toFixed(1)} ${(PAD.t + cH).toFixed(1)} Z`;

  const findClosest = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let closest = 0, minDist = Infinity;
    data.forEach((_, i) => {
      const dist = Math.abs(xOf(i) - svgX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setActiveIdx(closest);
  };

  const active = activeIdx !== null ? data[activeIdx] : null;
  const ax = activeIdx !== null ? xOf(activeIdx) : 0;
  const ay = activeIdx !== null ? yOf(data[activeIdx].hours) : 0;
  const TIP_W = 80, TIP_H = 40;
  const tipX = Math.min(Math.max(ax - TIP_W / 2, PAD.l), W - PAD.r - TIP_W);
  const tipY = Math.max(ay - TIP_H - 10, 2);

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${W} ${H + 18}`}
      style={{ display: 'block', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
      onMouseMove={e => findClosest(e.clientX)}
      onMouseLeave={() => setActiveIdx(null)}
      onTouchStart={e => { e.preventDefault(); findClosest(e.touches[0].clientX); }}
      onTouchMove={e => { e.preventDefault(); findClosest(e.touches[0].clientX); }}
    >
      <defs>
        <linearGradient id="mlAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y grid + labels */}
      {yTicks.map(v => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'} strokeWidth={1} />
            <text x={PAD.l - 4} y={y + 3.5} textAnchor="end" fill={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.40)'} fontSize={7.5} fontFamily="'Area','Inter',sans-serif">{v}</text>
          </g>
        );
      })}

      {/* Area + line */}
      <path d={areaD} fill="url(#mlAreaGrad)" />
      <path d={pathD} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={xOf(i)} y={H + 14} textAnchor="middle" fill={i === activeIdx ? (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.75)') : (isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.40)')} fontSize={9} fontFamily="'Area','Inter',sans-serif" fontWeight={i === activeIdx ? 700 : 500}>{d.label}</text>
      ))}

      {/* Active indicator */}
      {active && (
        <g>
          <line x1={ax} y1={PAD.t} x2={ax} y2={PAD.t + cH} stroke={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'} strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={ax} cy={ay} r={5} fill="#22c55e" stroke={isDark ? '#141416' : '#fff'} strokeWidth={2.5} />
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={8} fill={isDark ? 'rgba(14,14,16,0.96)' : 'rgba(250,250,252,0.96)'} stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'} strokeWidth={1} />
          <text x={tipX + TIP_W / 2} y={tipY + 16} textAnchor="middle" fill={isDark ? '#ffffff' : '#111111'} fontSize={10} fontFamily="'Area','Inter',sans-serif" fontWeight={700}>{active.label}</text>
          <text x={tipX + TIP_W / 2} y={tipY + 30} textAnchor="middle" fill="#22c55e" fontSize={10} fontFamily="'Area','Inter',sans-serif" fontWeight={700}>{i18next.t('statsPage.hrsTooltip', { ns: 'home', hours: active.hours })}</text>
        </g>
      )}
    </svg>
  );
}

/* ── Types ───────────────────────────────────────────────────── */
type SplitStats = {
  hoursTotal: number; minutesTotal: number;
  watchedCount: number; watchingCount: number; wantCount: number;
  genres: Array<{ g: string; pct: number; color: string }>;
  platforms: string[];
  reviewsCount: number; likesReceived: number;
  marathons: Array<{ id: string; title: string; poster: string; eps: number }>;
  totalEpisodes: number;
};

/* ── Main page ───────────────────────────────────────────────── */
export default function StatsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { t } = useTranslation('home');

  const [tab, setTab]                 = useState<'series' | 'filmes'>('series');
  const [statsLoading, setStatsLoading] = useState(true);
  const [showNavTitle, setShowNavTitle] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const [seriesStats, setSeriesStats] = useState<SplitStats | null>(null);
  const [filmesStats, setFilmesStats] = useState<SplitStats | null>(null);
  const [weekEpData,  setWeekEpData]  = useState<number[]>(Array(7).fill(0));
  const [weekActData, setWeekActData] = useState<number[]>(Array(7).fill(0));
  const [monthlyHoursData, setMonthlyHoursData] = useState<Array<{ label: string; hours: number }>>([]);
  const [ratingDist, setRatingDist]   = useState<{ series: number[]; filmes: number[] }>({ series: [0,0,0,0,0], filmes: [0,0,0,0,0] });
  const [avgSeriesRating, setAvgSeriesRating] = useState(0);
  const [avgFilmRating,   setAvgFilmRating]   = useState(0);

  /* ── Stats calculation ── */
  useEffect(() => {
    if (loading) return;

    const watched  = listStore.get('watched');
    const watching = listStore.get('watching');
    const want     = listStore.get('want');
    const streams  = (prefsStore.get()?.streams ?? []).slice(0, 5);

    const tvWatched    = watched.filter(w => w.type === 'tv');
    const movieWatched = watched.filter(w => w.type === 'movie');
    const tvWatching   = watching.filter(w => w.type === 'tv');
    const mvWatching   = watching.filter(w => w.type === 'movie');
    const tvWant       = want.filter(w => w.type === 'tv');
    const mvWant       = want.filter(w => w.type === 'movie');

    const epAll = epWatchedStore.getAll();
    const epCountMap: Record<string, number> = {};
    let totalEpisodes = 0;
    for (const [showId, seasons] of Object.entries(epAll)) {
      const cnt = Object.values(seasons).reduce((s, eps) => s + eps.length, 0);
      epCountMap[showId] = cnt;
      totalEpisodes += cnt;
    }

    const marathons = tvWatched
      .map(t => ({ id: String(t.id), title: t.title, poster: (t as any).poster || '', eps: epCountMap[String(t.id)] || 0 }))
      .filter(m => m.eps > 0).sort((a,b) => b.eps - a.eps).slice(0, 5);

    const profile = profileStore.get(user?.uid);
    const myName  = profile.username || profile.name || '';
    const myRevs  = myName ? revStore.getByUser(myName) : [];
    const tvRevs  = myRevs.filter(r => r.itemKey?.startsWith('tv_'));
    const mvRevs  = myRevs.filter(r => r.itemKey?.startsWith('movie_'));
    const tvLikes = tvRevs.reduce((s, r) => s + (r.likes ?? 0), 0);
    const mvLikes = mvRevs.reduce((s, r) => s + (r.likes ?? 0), 0);

    const tvDist = [0,0,0,0,0]; const mvDist = [0,0,0,0,0];
    tvRevs.forEach(r => { const s = Math.round((r as any).rating ?? 0); if (s >= 1 && s <= 5) tvDist[s-1]++; });
    mvRevs.forEach(r => { const s = Math.round((r as any).rating ?? 0); if (s >= 1 && s <= 5) mvDist[s-1]++; });
    setRatingDist({ series: tvDist, filmes: mvDist });

    const tvAvg = tvRevs.length > 0 ? tvRevs.reduce((s,r) => s + ((r as any).rating ?? 0), 0) / tvRevs.length : 0;
    const mvAvg = mvRevs.length > 0 ? mvRevs.reduce((s,r) => s + ((r as any).rating ?? 0), 0) / mvRevs.length : 0;
    setAvgSeriesRating(Math.round(tvAvg * 10) / 10);
    setAvgFilmRating(Math.round(mvAvg * 10) / 10);

    const allTracked = [...tvWatched, ...tvWatching, ...movieWatched, ...mvWatching];
    const tvWatchedIds  = new Set(tvWatched.map(w => w.id));
    const mvWatchedIds  = new Set(movieWatched.map(w => w.id));

    if (allTracked.length === 0) {
      const empty: SplitStats = { hoursTotal:0,minutesTotal:0,watchedCount:0,watchingCount:0,wantCount:0,genres:[],platforms:streams,reviewsCount:0,likesReceived:0,marathons:[],totalEpisodes:0 };
      setSeriesStats({ ...empty, watchedCount:tvWatched.length, watchingCount:tvWatching.length, wantCount:tvWant.length, reviewsCount:tvRevs.length, likesReceived:tvLikes, marathons, totalEpisodes });
      setFilmesStats({ ...empty, watchedCount:movieWatched.length, watchingCount:mvWatching.length, wantCount:mvWant.length, reviewsCount:mvRevs.length, likesReceived:mvLikes });
      setStatsLoading(false);
      return;
    }

    Promise.all(allTracked.slice(0, 60).map(async item => {
      try {
        const res = await fetch(`/api/tmdb?endpoint=${item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`}`);
        return { data: await res.json(), item };
      } catch { return null; }
    })).then(results => {
      let tvMins = 0; let mvMins = 0;
      const tvGenre: Record<string,number> = {}; const mvGenre: Record<string,number> = {};

      results.forEach(r => {
        if (!r) return;
        const { data: d, item } = r;
        (d.genres || []).forEach((g: { name: string }) => {
          if (item.type === 'tv') tvGenre[g.name] = (tvGenre[g.name] || 0) + 1;
          else                    mvGenre[g.name] = (mvGenre[g.name] || 0) + 1;
        });
        if (item.type === 'movie') {
          if (mvWatchedIds.has(item.id)) mvMins += d.runtime || 110;
        } else {
          const epRuntime = d.episode_run_time?.[0] || 45;
          if (tvWatchedIds.has(item.id)) tvMins += epRuntime * Math.min(d.number_of_episodes || 10, 24);
          else { const last = (d.seasons||[]).filter((s:any)=>s.season_number>0).at(-1); tvMins += epRuntime*(last?.episode_count ?? Math.min(d.number_of_episodes||6,12)); }
        }
        const idx = marathons.findIndex(m => m.id === String(item.id));
        if (idx >= 0 && d.poster_path) marathons[idx].poster = tmdbImg(d.poster_path, 'w92') ?? undefined;
      });

      const toGenreList = (map: Record<string,number>) => {
        const total = Math.max(Object.values(map).reduce((a,b)=>a+b,0), 1);
        return Object.entries(map).sort(([,a],[,b])=>b-a).slice(0,5).map(([name,count]) => ({ g:name, pct:Math.round(count/total*100), color:GENRE_COLORS[name]||'#6b7280' }));
      };

      setSeriesStats({ hoursTotal:Math.round(tvMins/60), minutesTotal:tvMins, watchedCount:tvWatched.length, watchingCount:tvWatching.length, wantCount:tvWant.length, genres:toGenreList(tvGenre), platforms:streams, reviewsCount:tvRevs.length, likesReceived:tvLikes, marathons, totalEpisodes });
      setFilmesStats({ hoursTotal:Math.round(mvMins/60), minutesTotal:mvMins, watchedCount:movieWatched.length, watchingCount:mvWatching.length, wantCount:mvWant.length, genres:toGenreList(mvGenre), platforms:streams, reviewsCount:mvRevs.length, likesReceived:mvLikes, marathons:[], totalEpisodes:0 });
      setStatsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  /* ── Firestore activity ── */
  useEffect(() => {
    if (loading || !user || !firebaseConfigured) return;
    (async () => {
      try {
        const aggregate = await dbUserStatsStore.get(getDB(), user.uid);
        const weekEp: number[]  = Array(7).fill(0);
        const weekAct: number[] = Array(7).fill(0);
        for (let index = 0; index < 7; index += 1) {
          const date = new Date(Date.now() - (6 - index) * 86_400_000).toISOString().slice(0, 10);
          weekEp[index] = aggregate.recentDays[date]?.watched || 0;
          weekAct[index] = aggregate.recentDays[date]?.activities || 0;
        }
        const months: Array<{ label: string; key: string; minutes: number }> = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          months.push({ label: getMonthShort(d), key, minutes: aggregate.months[key]?.watchedMinutes || 0 });
        }
        setWeekEpData(weekEp);
        setWeekActData(weekAct);
        setMonthlyHoursData(months.map(m => ({ label: m.label, hours: Math.round(m.minutes / 60) })));
      } catch {}
    })();
  }, [loading, user]);

  /* ── Nav title observer ── */
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setShowNavTitle(!entry.isIntersecting), { rootMargin: '-56px 0px 0px 0px', threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [statsLoading]);

  const btnStyle: React.CSSProperties = { width:34,height:34,borderRadius:17, background: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)', border: isDark ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(0,0,0,0.12)', cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' };
  const btnIcon = isDark ? '#fff' : 'rgba(0,0,0,0.70)';
  const backBtn = (
    <button onClick={() => navigateBack(router)} style={btnStyle}>
      <Icon name="chevronL" size={16} color={btnIcon} />
    </button>
  );
  const bellBtn = (
    <button onClick={() => router.push('/notifications')} style={btnStyle}>
      <Icon name="bell" size={16} color={btnIcon} />
    </button>
  );
  const statLabelColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)';

  if (statsLoading) {
    return (
      <Frame><Screen>
        <ScrollArea style={{ padding: '0 0 32px' }}>
          <GlassHeader left={backBtn} right={bellBtn} navTitle={t('statsPage.title')} showNavTitle={showNavTitle} />
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:1,gap:12,minHeight:300 }}>
            <div style={{ width:40,height:40,borderRadius:20,border:`3px solid ${T.pink}`,borderTopColor:'transparent',animation:'spin 0.8s linear infinite' }} />
            <Txt size={13} color={T.t3}>{t('statsPage.loading')}</Txt>
          </div>
        </ScrollArea>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </Screen></Frame>
    );
  }

  const active   = tab === 'series' ? seriesStats : filmesStats;
  const tp       = timeParts(active?.minutesTotal ?? 0);
  const avgRating = tab === 'series' ? avgSeriesRating : avgFilmRating;
  const activeRatingDist = tab === 'series' ? ratingDist.series : ratingDist.filmes;
  const activeGenres = (active?.genres ?? []).slice(0, 5);
  const donutTotal = activeGenres.reduce((s,g) => s + g.pct, 0);
  const donutSegments = donutTotal > 0
    ? activeGenres.map((g, i) => ({ pct: Math.round(g.pct / donutTotal * 100), color: DONUT_COLORS[i] ?? '#6b7280', label: g.g }))
    : [];
  const topGenre = activeGenres[0]?.g ?? '—';

  const avgRuntime = (seriesStats?.totalEpisodes ?? 0) > 0
    ? Math.round((seriesStats!.minutesTotal / seriesStats!.totalEpisodes) * 10) / 10
    : 45;
  const weekHoursData = weekEpData.map(ep => Math.round(ep * avgRuntime / 60 * 10) / 10);
  const hours7d = Math.round(weekEpData.reduce((s,v) => s+v, 0) * avgRuntime / 60);
  const eps7d   = weekEpData.reduce((s,v) => s+v, 0);
  const dateLabels = last7DateLabels();

  const LBL: React.CSSProperties  = { display: 'block', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 12 } as React.CSSProperties;

  return (
    <Frame>
      <Screen style={{ background: T.bg }}>
        <ScrollArea style={{ padding: '0 0 32px' }}>
          <GlassHeader left={backBtn} right={bellBtn} navTitle={t('statsPage.title')} showNavTitle={showNavTitle} />

          <div ref={titleRef} style={{ padding: '20px 16px 4px' }}>
            <Txt size={22} weight={900} color={T.t1} style={{ display:'block', letterSpacing:'-0.4px' }}>{t('statsPage.title')}</Txt>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:'flex', gap:8, margin:'12px 16px 0' }}>
            {([{ id:'series', label: t('statsPage.series') },{ id:'filmes', label: t('statsPage.moviesTab') }] as const).map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding:'8px 20px', borderRadius:24, background: tab===id ? T.active : 'transparent', border: tab===id ? 'none' : `1px solid ${T.border}`, color: tab===id ? '#fff' : T.t2, fontSize:14, fontWeight: tab===id ? 800 : 600, fontFamily:"'Area','Inter',sans-serif", cursor:'pointer', transition:'all 0.2s' } as React.CSSProperties}>
                {label}
              </button>
            ))}
          </div>

          {/* ── 1. Tempo gasto ── */}
          <StatCard>
            <Txt size={10} weight={700} color={statLabelColor} style={LBL}>
              {tab === 'series' ? t('statsPage.timeSpentSeries') : t('statsPage.timeSpentMovies')}
            </Txt>
            <div style={{ display:'flex', alignItems:'flex-end', gap:12, marginBottom: 6 }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3 }}>
                <Txt size={36} weight={900} color={T.white} style={{ lineHeight:1 }}>{tp.months}</Txt>
                <Txt size={13} weight={500} color="rgba(255,255,255,0.38)" style={{ paddingBottom:3 }}>{t('statsPage.months')}</Txt>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3 }}>
                <Txt size={36} weight={900} color={T.white} style={{ lineHeight:1 }}>{tp.days}</Txt>
                <Txt size={13} weight={500} color="rgba(255,255,255,0.38)" style={{ paddingBottom:3 }}>{t('statsPage.days')}</Txt>
              </div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:3 }}>
                <Txt size={36} weight={900} color={T.white} style={{ lineHeight:1 }}>{tp.hours}</Txt>
                <Txt size={13} weight={500} color="rgba(255,255,255,0.38)" style={{ paddingBottom:3 }}>{t('statsPage.hours')}</Txt>
              </div>
            </div>
            {tab === 'series' && hours7d > 0 && (
              <Txt size={10} weight={700} color={statLabelColor} style={{ textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:14 }}>
                {t('statsPage.last7dHours', { count: hours7d })}
              </Txt>
            )}
            {tab === 'series' && (
              <DayBarChart data={weekHoursData} labels={dateLabels} unit={t('statsPage.hours')} barColor="#22c55e" todayColor={T.pink} isDark={isDark} />
            )}
            {tab === 'filmes' && (active?.minutesTotal ?? 0) === 0 && (
              <Txt size={12} color="rgba(255,255,255,0.28)">{t('statsPage.noMovieTime')}</Txt>
            )}
          </StatCard>

          {/* ── 2. Total de episódios (séries) ── */}
          {tab === 'series' && (
            <StatCard>
              <Txt size={10} weight={700} color={statLabelColor} style={LBL}>
                {t('statsPage.totalEps')}
              </Txt>
              <Txt size={52} weight={900} color={T.white} style={{ display:'block', lineHeight:1, marginBottom:6 }}>
                {active?.totalEpisodes ?? 0}
              </Txt>
              {eps7d > 0 && (
                <Txt size={10} weight={700} color={statLabelColor} style={{ textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:14 }}>
                  {t('statsPage.last7dEps', { count: eps7d })}
                </Txt>
              )}
              <DayBarChart data={weekEpData} labels={dateLabels} unit={t('statsPage.episodesUnit')} barColor="#a78bfa" todayColor={T.pink} isDark={isDark} />
            </StatCard>
          )}

          {/* ── 3. Mini stats row ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, margin:'10px 16px 0' }}>
            {[
              { value: active?.watchedCount ?? 0, label: tab === 'series' ? t('statsPage.seriesWatched') : t('statsPage.moviesWatched') },
              { value: active?.reviewsCount ?? 0, label: t('statsPage.reviewsCount') },
              { value: avgRating > 0 ? avgRating : '—', label: t('statsPage.avgRating') },
            ].map((s, i) => (
              <div key={i} style={{ background: isDark ? '#141416' : 'var(--c-card)', borderRadius: 16, border: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid var(--c-border)', padding: '14px 10px', textAlign:'center', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', inset:0, backgroundImage:`radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'} 1px, transparent 1px)`, backgroundSize:'18px 18px', pointerEvents:'none' }} />
                <Txt size={22} weight={900} color={T.t1} style={{ display:'block', lineHeight:1, position:'relative' }}>{s.value}</Txt>
                <Txt size={8} weight={700} color={statLabelColor} style={{ display:'block', textTransform:'uppercase', letterSpacing:0.8, marginTop:6, position:'relative' }}>{s.label}</Txt>
              </div>
            ))}
          </div>

          {/* ── 4. Gêneros prediletos ── */}
          {activeGenres.length > 0 && (
            <StatCard>
              <Txt size={10} weight={700} color={statLabelColor} style={LBL}>{t('statsPage.topGenres')}</Txt>
              <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                <MultiSegmentDonut segments={donutSegments} centerLabel={topGenre} isDark={isDark} />
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                  {donutSegments.map((seg, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:8, height:8, borderRadius:4, background:seg.color, flexShrink:0 }} />
                      <Txt size={11} weight={600} color={T.t2} style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{seg.label}</Txt>
                      <Txt size={11} weight={700} color={seg.color}>{seg.pct}%</Txt>
                    </div>
                  ))}
                </div>
              </div>
            </StatCard>
          )}

          {/* ── 5. Distribuição de avaliações ── */}
          <StatCard>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <Txt size={10} weight={700} color={statLabelColor} style={{ textTransform:'uppercase', letterSpacing:1.1 }}>{t('statsPage.ratingDist')}</Txt>
            </div>
            <RatingDistribution dist={activeRatingDist} isDark={isDark} />
          </StatCard>

          {/* ── 6. Histórico de consumo ── */}
          <StatCard>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <Txt size={10} weight={700} color={statLabelColor} style={{ textTransform:'uppercase', letterSpacing:1.1 }}>{t('statsPage.consumptionHistory')}</Txt>
            </div>
            <MonthlyLineChart data={monthlyHoursData} isDark={isDark} />
          </StatCard>

          <div style={{ height: 32 }} />
        </ScrollArea>
      </Screen>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </Frame>
  );
}
