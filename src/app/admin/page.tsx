'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Txt, Btn, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { listStore, revStore, sliderStore, notifiedStore, type SliderItem } from '@/lib/store';
import { checkUpcomingReleases, DAYS_THRESHOLD } from '@/lib/releaseNotifier';

/* ─── types ─── */
type AdminSection =
  | 'metrics' | 'destaques' | 'banners' | 'noticias'
  | 'notificacoes' | 'slider' | 'usuarios' | 'vip' | 'lancamentos' | 'moderacao';

interface FeaturedItem { id: string; title: string; type: 'movie' | 'tv'; poster?: string; pinned?: boolean }
interface BannerItem { id: string; title: string; subtitle: string; cta: string; color: string; active: boolean }
interface NewsItem { id: string; title: string; body: string; category: string; date: string; published: boolean }
interface PushNotif { id: string; title: string; body: string; target: 'all' | 'vip' | 'free'; sent: boolean; date: string; scheduledAt?: string }
interface MockUser { id: string; name: string; email: string; plan: 'free' | 'vip'; joined: string; titles: number }
interface LaunchItem { id: string; title: string; type: 'movie' | 'tv'; date: string; platform: string; highlight: boolean }
interface ReviewItem { id: string; user: string; title: string; rating: number; text: string; flagged: boolean; approved: boolean }

/* ─── seed helpers ─── */
const uid = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

const SEED_FEATURED: FeaturedItem[] = [
  { id: '1', title: 'Stranger Things', type: 'tv', pinned: true },
  { id: '2', title: 'Duna: Parte Dois', type: 'movie', pinned: false },
  { id: '3', title: 'The Last of Us', type: 'tv', pinned: false },
];
const SEED_BANNERS: BannerItem[] = [
  { id: '1', title: 'Novidades de Abril', subtitle: 'Confira os lançamentos do mês', cta: 'Ver agora', color: '#E50914', active: true },
  { id: '2', title: 'Semana VIP', subtitle: 'Assine e desbloqueie tudo', cta: 'Assinar', color: '#d4a810', active: false },
];
const SEED_NEWS: NewsItem[] = [
  { id: '1', title: 'Stranger Things: temporada 5 confirmada', body: 'Netflix anuncia data de estreia...', category: 'Séries', date: today(), published: true },
  { id: '2', title: 'Oscar 2025: confira os indicados', body: 'A Academia divulgou a lista...', category: 'Cinema', date: today(), published: false },
];
const SEED_LAUNCHES: LaunchItem[] = [
  { id: '1', title: 'Arcane – Season 2', type: 'tv', date: '2025-11-01', platform: 'Netflix', highlight: true },
  { id: '2', title: 'Deadpool 3', type: 'movie', date: '2025-07-26', platform: 'Disney+', highlight: false },
];
const SEED_REVIEWS: ReviewItem[] = [
  { id: '1', user: 'user_a', title: 'Breaking Bad', rating: 5, text: 'Obra-prima absoluta!', flagged: false, approved: true },
  { id: '2', user: 'user_b', title: 'Rings of Power', rating: 1, text: 'Palavrões removidos...', flagged: true, approved: false },
];
const SEED_USERS: MockUser[] = [
  { id: '1', name: 'Lucas Tales', email: 'lucas@sectime.com', plan: 'vip', joined: '2025-01-10', titles: 42 },
  { id: '2', name: 'Ana Costa', email: 'ana@gmail.com', plan: 'free', joined: '2025-03-22', titles: 7 },
  { id: '3', name: 'Rodrigo M.', email: 'rod@gmail.com', plan: 'free', joined: '2025-04-01', titles: 3 },
];

const LS = {
  get<T>(k: string, def: T): T {
    if (typeof window === 'undefined') return def;
    try { return JSON.parse(localStorage.getItem('admin_' + k) || 'null') ?? def; } catch { return def; }
  },
  set<T>(k: string, v: T) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('admin_' + k, JSON.stringify(v));
  },
};

/* ─── sidebar nav ─── */
const NAV: { id: AdminSection; icon: string; label: string }[] = [
  { id: 'metrics',      icon: 'chart',  label: 'Métricas'         },
  { id: 'destaques',    icon: 'star',   label: 'Destaques'        },
  { id: 'banners',      icon: 'film',   label: 'Banners'          },
  { id: 'noticias',     icon: 'bell',   label: 'Notícias'         },
  { id: 'notificacoes', icon: 'bell',   label: 'Notificações'     },
  { id: 'slider',       icon: 'tv',     label: 'Slider da Home'   },
  { id: 'usuarios',     icon: 'user',   label: 'Usuários'         },
  { id: 'vip',          icon: 'crown',  label: 'VIP / Assinaturas'},
  { id: 'lancamentos',  icon: 'tv',     label: 'Lançamentos'      },
  { id: 'moderacao',    icon: 'flag',   label: 'Moderação'        },
];

/* ══════════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const [section, setSection] = useState<AdminSection>('metrics');
  const [toast, setToast] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);

  /* ── data states ── */
  const [featured, setFeatured]     = useState<FeaturedItem[]>([]);
  const [banners, setBanners]       = useState<BannerItem[]>([]);
  const [news, setNews]             = useState<NewsItem[]>([]);
  const [pushList, setPushList]     = useState<PushNotif[]>([]);
  const [users]                     = useState<MockUser[]>(SEED_USERS);
  const [launches, setLaunches]     = useState<LaunchItem[]>([]);
  const [reviews, setReviews]       = useState<ReviewItem[]>([]);

  /* ── push notification states ── */
  const [notifPerm, setNotifPerm]   = useState<NotificationPermission>('default');
  const [newPush, setNewPush]       = useState({ title: '', body: '', target: 'all' as PushNotif['target'] });
  const [schedDate, setSchedDate]   = useState(today());
  const [schedTime, setSchedTime]   = useState(nowTime());
  const [schedEnabled, setSchedEnabled] = useState(false);

  /* ── slider states ── */
  const [sliderItems, setSliderItems]     = useState<SliderItem[]>([]);
  const [sliderQuery, setSliderQuery]     = useState('');
  const [sliderResults, setSliderResults] = useState<SliderItem[]>([]);
  const [sliderSearching, setSliderSearching] = useState(false);

  /* ── form states ── */
  const [newNews, setNewNews]       = useState({ title: '', body: '', category: 'Séries' });
  const [newFeat, setNewFeat]       = useState({ title: '', type: 'movie' as 'movie'|'tv' });
  const [newBanner, setNewBanner]   = useState({ title: '', subtitle: '', cta: 'Ver agora', color: '#E50914' });
  const [newLaunch, setNewLaunch]   = useState({ title: '', type: 'movie' as 'movie'|'tv', date: today(), platform: 'Netflix' });

  /* ── init ── */
  useEffect(() => {
    setFeatured(LS.get('featured', SEED_FEATURED));
    setBanners(LS.get('banners', SEED_BANNERS));
    setNews(LS.get('news', SEED_NEWS));
    setPushList(LS.get('push', [] as PushNotif[]));
    setLaunches(LS.get('launches', SEED_LAUNCHES));
    setReviews(LS.get('reviews', SEED_REVIEWS));
    setSliderItems(sliderStore.get());

    /* Register service worker */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    /* Read current notification permission */
    if (typeof Notification !== 'undefined') {
      setNotifPerm(Notification.permission);
    }
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const save = <T,>(key: string, setter: React.Dispatch<React.SetStateAction<T>>, val: T) => {
    setter(val); LS.set(key, val);
  };

  /* ── push notification helpers ── */
  const requestNotifPerm = async () => {
    if (typeof Notification === 'undefined') {
      showToast('Notificações não suportadas neste navegador');
      return;
    }
    const result = await Notification.requestPermission();
    setNotifPerm(result);
    if (result === 'granted') showToast('✅ Permissão concedida!');
    else showToast('❌ Permissão negada');
  };

  const fireNotification = useCallback(async (title: string, body: string) => {
    if (typeof Notification === 'undefined') return;
    if (notifPerm !== 'granted') {
      showToast('Ative as notificações primeiro!');
      return;
    }
    try {
      /* Prefer service worker showNotification (works even when tab is not focused) */
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        } as NotificationOptions);
      } else {
        new Notification(title, { body });
      }
    } catch {
      /* Fallback to basic Notification */
      try { new Notification(title, { body }); } catch {}
    }
  }, [notifPerm]);

  const sendPushNow = async () => {
    if (!newPush.title.trim()) return;
    await fireNotification(newPush.title, newPush.body);
    const entry: PushNotif = { id: uid(), ...newPush, sent: true, date: today() };
    const updated = [entry, ...pushList];
    save('push', setPushList, updated);
    setNewPush({ title: '', body: '', target: 'all' });
    showToast('🔔 Notificação enviada!');
  };

  const schedulePush = () => {
    if (!newPush.title.trim() || !schedDate || !schedTime) return;
    const fireAt = new Date(`${schedDate}T${schedTime}:00`).getTime();
    const now = Date.now();
    const delay = fireAt - now;
    if (delay <= 0) { showToast('Escolha um horário futuro'); return; }

    /* Save as pending in history */
    const entry: PushNotif = {
      id: uid(), ...newPush, sent: false, date: today(),
      scheduledAt: `${schedDate} ${schedTime}`,
    };
    const updated = [entry, ...pushList];
    save('push', setPushList, updated);

    /* Schedule the actual notification */
    setTimeout(async () => {
      await fireNotification(entry.title, entry.body);
      const list: PushNotif[] = LS.get('push', []);
      const refreshed = list.map(p => p.id === entry.id ? { ...p, sent: true } : p);
      LS.set('push', refreshed);
      setPushList(refreshed);
    }, delay);

    setNewPush({ title: '', body: '', target: 'all' });
    setSchedDate(today());
    setSchedTime(nowTime());
    setSchedEnabled(false);
    showToast(`📅 Agendado para ${schedDate} às ${schedTime}`);
  };

  /* ── slider helpers ── */
  const searchTMDB = async () => {
    if (!sliderQuery.trim()) return;
    setSliderSearching(true);
    setSliderResults([]);
    try {
      const res = await fetch(
        `/api/tmdb?endpoint=/search/multi&query=${encodeURIComponent(sliderQuery)}&page=1`
      );
      const data = await res.json();
      const items: SliderItem[] = (data.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .slice(0, 6)
        .map((r: any): SliderItem => ({
          id: r.id,
          title: (r.title || r.name || '') as string,
          type: r.media_type as 'movie' | 'tv',
          backdrop_path: r.backdrop_path ?? null,
          poster_path: r.poster_path ?? null,
          overview: (r.overview || '') as string,
          buttonText: 'Quero ver',
          category: r.media_type === 'movie' ? 'nos_cinemas' : 'no_streaming',
        }));
      setSliderResults(items);
    } catch { showToast('Erro ao buscar'); }
    setSliderSearching(false);
  };

  const addToSlider = (item: SliderItem) => {
    if (sliderItems.some(s => s.id === item.id)) { showToast('Já está no slider!'); return; }
    const updated = [...sliderItems, item];
    setSliderItems(updated); sliderStore.set(updated);
    setSliderResults([]);
    setSliderQuery('');
    showToast('✅ Adicionado ao slider!');
  };

  const removeFromSlider = (id: number) => {
    const updated = sliderItems.filter(s => s.id !== id);
    setSliderItems(updated); sliderStore.set(updated);
    showToast('Removido');
  };

  const updateSliderItem = (id: number, patch: Partial<SliderItem>) => {
    const updated = sliderItems.map(s => s.id === id ? { ...s, ...patch } : s);
    setSliderItems(updated); sliderStore.set(updated);
  };

  const moveSlider = (idx: number, dir: 'up' | 'down') => {
    const arr = [...sliderItems];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setSliderItems(arr); sliderStore.set(arr);
  };

  /* ── real metrics from store ── */
  const metrics = useMemo(() => ({
    usuarios: users.length,
    vips: users.filter(u => u.plan === 'vip').length,
    assistidos: listStore.get('watched').length,
    querendo: listStore.get('want').length,
    maratonando: listStore.get('watching').length,
    avaliacoes: revStore.countAll(),
    noticias: news.filter(n => n.published).length,
    destaques: featured.filter(f => f.pinned).length,
  }), [users, news, featured]);

  /* ── styles ── */
  const S = {
    page: { display: 'flex', minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: "'Area','Inter',sans-serif" } as React.CSSProperties,
    sidebar: { width: sideOpen ? 220 : 60, flexShrink: 0, background: T.bg, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column' as const, transition: 'width 0.25s ease', overflow: 'hidden' },
    navItem: (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', background: active ? 'var(--c-glass-bg)' : 'transparent', borderLeft: active ? `3px solid ${T.pink}` : '3px solid transparent', color: active ? T.white : T.t3, fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', transition: 'all 0.15s' }),
    main: { flex: 1, padding: 28, overflowY: 'auto' as const },
    card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16 } as React.CSSProperties,
    statCard: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '18px 20px', textAlign: 'center' as const },
    input: { width: '100%', padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", outline: 'none', boxSizing: 'border-box' as const },
    row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.border}` } as React.CSSProperties,
    tag: (c: string): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 10, background: c, fontSize: 11, fontWeight: 700, color: T.white }),
  };

  const SectionTitle = ({ label }: { label: string }) => (
    <Txt size={22} weight={800} style={{ display: 'block', marginBottom: 20 }}>{label}</Txt>
  );

  /* ════════════ SECTIONS ════════════ */

  const Metrics = () => (
    <>
      <SectionTitle label="📊 Métricas de uso" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Usuários', value: metrics.usuarios, color: T.pink },
          { label: 'VIP', value: metrics.vips, color: T.gold },
          { label: 'Assistidos', value: metrics.assistidos, color: '#4ade80' },
          { label: 'Avaliações', value: metrics.avaliacoes, color: '#60a5fa' },
          { label: 'Querendo ver', value: metrics.querendo, color: '#f472b6' },
          { label: 'Maratonando', value: metrics.maratonando, color: '#a78bfa' },
          { label: 'Notícias ativas', value: metrics.noticias, color: '#fb923c' },
          { label: 'Destaques pin', value: metrics.destaques, color: T.red },
        ].map(m => (
          <div key={m.label} style={S.statCard}>
            <Txt size={28} weight={900} color={m.color} style={{ display: 'block' }}>{m.value}</Txt>
            <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4 }}>{m.label}</Txt>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <Txt size={15} weight={700} style={{ display: 'block', marginBottom: 12 }}>Atividade recente</Txt>
        {[
          { icon: '👤', text: 'Ana Costa se cadastrou', time: 'há 2h' },
          { icon: '⭐', text: 'Rodrigo avaliou Oppenheimer', time: 'há 4h' },
          { icon: '❤️', text: 'Lucas adicionou Breaking Bad aos favoritos', time: 'há 6h' },
          { icon: '🔔', text: 'Push enviado para todos os usuários', time: 'ontem' },
          { icon: '👑', text: 'Ana assinou plano VIP', time: '2 dias atrás' },
        ].map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 4 ? `1px solid ${T.border}` : 'none' }}>
            <Txt size={13}>{a.icon} {a.text}</Txt>
            <Txt size={12} color={T.t3}>{a.time}</Txt>
          </div>
        ))}
      </div>
    </>
  );

  const Destaques = () => {
    const add = () => {
      if (!newFeat.title.trim()) return;
      const updated = [...featured, { id: uid(), title: newFeat.title, type: newFeat.type, pinned: false }];
      save('featured', setFeatured, updated);
      setNewFeat({ title: '', type: 'movie' });
      showToast('Destaque adicionado');
    };
    const toggle = (id: string) => {
      const updated = featured.map(f => f.id === id ? { ...f, pinned: !f.pinned } : f);
      save('featured', setFeatured, updated);
    };
    const remove = (id: string) => {
      save('featured', setFeatured, featured.filter(f => f.id !== id));
      showToast('Removido');
    };
    return (
      <>
        <SectionTitle label="🌟 Filmes e séries em destaque" />
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Adicionar destaque</Txt>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="Título (ex: Duna: Parte Dois)" value={newFeat.title} onChange={e => setNewFeat(p => ({ ...p, title: e.target.value }))} />
            <select value={newFeat.type} onChange={e => setNewFeat(p => ({ ...p, type: e.target.value as 'movie'|'tv' }))}
              style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, cursor: 'pointer' }}>
              <option value="movie">Filme</option>
              <option value="tv">Série</option>
            </select>
          </div>
          <Btn label="Adicionar" variant="pink" size="sm" onClick={add} />
        </div>
        <div style={S.card}>
          {featured.map((f, i) => (
            <div key={f.id} style={{ ...S.row, borderBottom: i < featured.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <span style={S.tag(f.type === 'tv' ? '#3b82f6' : T.red)}>{f.type === 'tv' ? 'Série' : 'Filme'}</span>
              <Txt size={13} weight={600} style={{ flex: 1 }}>{f.title}</Txt>
              <button onClick={() => toggle(f.id)} style={{ background: f.pinned ? T.pink : T.surface2, border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', color: T.white, fontSize: 11, fontWeight: 700 }}>
                {f.pinned ? '📌 Fixado' : 'Fixar'}
              </button>
              <button onClick={() => remove(f.id)} style={{ background: T.redDim, border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>
                <Icon name="close" size={12} color={T.red} />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  };

  const Banners = () => {
    const add = () => {
      if (!newBanner.title.trim()) return;
      const updated = [...banners, { id: uid(), ...newBanner, active: true }];
      save('banners', setBanners, updated);
      setNewBanner({ title: '', subtitle: '', cta: 'Ver agora', color: '#E50914' });
      showToast('Banner criado');
    };
    const toggleActive = (id: string) => save('banners', setBanners, banners.map(b => b.id === id ? { ...b, active: !b.active } : b));
    const remove = (id: string) => { save('banners', setBanners, banners.filter(b => b.id !== id)); showToast('Removido'); };
    return (
      <>
        <SectionTitle label="🖼 Banners da home" />
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Novo banner</Txt>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={S.input} placeholder="Título" value={newBanner.title} onChange={e => setNewBanner(p => ({ ...p, title: e.target.value }))} />
            <input style={S.input} placeholder="Subtítulo" value={newBanner.subtitle} onChange={e => setNewBanner(p => ({ ...p, subtitle: e.target.value }))} />
            <input style={S.input} placeholder="Texto do botão (CTA)" value={newBanner.cta} onChange={e => setNewBanner(p => ({ ...p, cta: e.target.value }))} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={newBanner.color} onChange={e => setNewBanner(p => ({ ...p, color: e.target.value }))}
                style={{ width: 44, height: 40, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }} />
              <Txt size={12} color={T.t3}>Cor do banner</Txt>
            </div>
          </div>
          <Btn label="Criar banner" variant="pink" size="sm" onClick={add} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {banners.map(b => (
            <div key={b.id} style={{ ...S.card, borderLeft: `4px solid ${b.color}`, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 0 }}>
              <div style={{ flex: 1 }}>
                <Txt size={14} weight={700} style={{ display: 'block' }}>{b.title}</Txt>
                <Txt size={12} color={T.t3} style={{ display: 'block' }}>{b.subtitle} · CTA: "{b.cta}"</Txt>
              </div>
              <button onClick={() => toggleActive(b.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: b.active ? '#22c55e22' : T.surface2, color: b.active ? '#4ade80' : T.t3, fontWeight: 700, fontSize: 12 }}>
                {b.active ? '● Ativo' : '○ Inativo'}
              </button>
              <button onClick={() => remove(b.id)} style={{ background: T.redDim, border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}>
                <Icon name="close" size={12} color={T.red} />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  };

  const Noticias = () => {
    const add = () => {
      if (!newNews.title.trim()) return;
      const updated = [...news, { id: uid(), ...newNews, date: today(), published: false }];
      save('news', setNews, updated);
      setNewNews({ title: '', body: '', category: 'Séries' });
      showToast('Notícia criada');
    };
    const toggle = (id: string) => save('news', setNews, news.map(n => n.id === id ? { ...n, published: !n.published } : n));
    const remove = (id: string) => { save('news', setNews, news.filter(n => n.id !== id)); showToast('Removida'); };
    const CATS = ['Séries', 'Cinema', 'Streaming', 'Premiações', 'Bastidores'];
    return (
      <>
        <SectionTitle label="📰 Notícias e recomendações" />
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Nova notícia</Txt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            <input style={S.input} placeholder="Título da notícia" value={newNews.title} onChange={e => setNewNews(p => ({ ...p, title: e.target.value }))} />
            <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} placeholder="Corpo da notícia..." value={newNews.body} onChange={e => setNewNews(p => ({ ...p, body: e.target.value }))} />
            <select value={newNews.category} onChange={e => setNewNews(p => ({ ...p, category: e.target.value }))}
              style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, cursor: 'pointer' }}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <Btn label="Criar notícia" variant="pink" size="sm" onClick={add} />
        </div>
        {news.map((n, i) => (
          <div key={n.id} style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={S.tag('#6366f1')}>{n.category}</span>
                <Txt size={11} color={T.t4}>{n.date}</Txt>
              </div>
              <Txt size={14} weight={700} style={{ display: 'block' }}>{n.title}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{n.body.slice(0, 80)}...</Txt>
            </div>
            <button onClick={() => toggle(n.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: n.published ? '#22c55e22' : T.surface2, color: n.published ? '#4ade80' : T.t3, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
              {n.published ? '✓ Publicado' : 'Publicar'}
            </button>
            <button onClick={() => remove(n.id)} style={{ background: T.redDim, border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}>
              <Icon name="close" size={12} color={T.red} />
            </button>
          </div>
        ))}
      </>
    );
  };

  /* ── Real Push Notifications ── */
  const Notificacoes = () => {
    const permColor = notifPerm === 'granted' ? '#4ade80' : notifPerm === 'denied' ? T.red : T.gold;
    const permLabel = notifPerm === 'granted' ? 'Permitido' : notifPerm === 'denied' ? 'Bloqueado' : 'Não solicitado';

    /* ── Diagnostic test: fires immediately, bypasses TMDB/lists ── */
    const sendTestNotification = async () => {
      if (typeof Notification === 'undefined') {
        showToast('❌ Notification API indisponível neste navegador');
        return;
      }
      if (notifPerm !== 'granted') {
        showToast('❌ Permissão não concedida — clique em "Solicitar permissão"');
        return;
      }
      const title = '🧪 Teste SEC TIME';
      const body = `Notificação de teste enviada às ${new Date().toLocaleTimeString('pt-BR')}`;

      /* Try service worker first */
      let mode = 'desconhecido';
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'sec-test',
          } as NotificationOptions);
          mode = 'service worker';
        } else {
          new Notification(title, { body });
          mode = 'Notification API';
        }
        showToast(`✅ Disparada via ${mode} — verifique o canto da tela!`);
      } catch (err: any) {
        /* Fallback */
        try {
          new Notification(title, { body });
          showToast('✅ Disparada via fallback Notification — verifique o canto da tela');
        } catch (e: any) {
          showToast(`❌ Falhou: ${err?.message || 'erro desconhecido'}`);
        }
      }
    };

    return (
      <>
        <SectionTitle label="🔔 Notificações push" />

        {/* Permission status card */}
        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: `${permColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: permColor }} />
          </div>
          <div style={{ flex: 1 }}>
            <Txt size={14} weight={700} style={{ display: 'block' }}>
              Status do navegador:&nbsp;
              <span style={{ color: permColor }}>{permLabel}</span>
            </Txt>
            <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 3 }}>
              {notifPerm === 'granted'
                ? 'Você receberá notificações push reais deste app.'
                : notifPerm === 'denied'
                ? 'Permissão bloqueada. Altere nas configurações do navegador.'
                : 'Clique em "Solicitar permissão" para habilitar notificações.'}
            </Txt>
          </div>
          {notifPerm !== 'granted' && notifPerm !== 'denied' && (
            <button
              onClick={requestNotifPerm}
              style={{ padding: '9px 18px', borderRadius: 8, background: T.pink, border: 'none', cursor: 'pointer', color: T.white, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Solicitar permissão
            </button>
          )}
          {notifPerm === 'denied' && (
            <Txt size={11} color={T.t4} style={{ maxWidth: 160, lineHeight: 1.4 }}>
              Abra as configurações do navegador e permita notificações para este site
            </Txt>
          )}
        </div>

        {/* Diagnostic / test card */}
        <div style={{ ...S.card, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(96,165,250,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Txt size={16}>🧪</Txt>
            </div>
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700} style={{ display: 'block' }}>Diagnóstico & teste direto</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                Dispara uma notificação imediata, sem depender de TMDB ou listas. Use isto para confirmar que a permissão e o sistema operacional estão funcionando.
              </Txt>
            </div>
          </div>

          {/* Diagnostic table */}
          <div style={{ background: T.surface2, borderRadius: 8, padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, color: T.t2 }}>
              <span style={{ color: T.t3 }}>Notification API</span>
              <span style={{ color: typeof Notification !== 'undefined' ? '#4ade80' : T.red }}>
                {typeof window !== 'undefined' && typeof Notification !== 'undefined' ? '✓ disponível' : '✗ indisponível'}
              </span>
              <span style={{ color: T.t3 }}>Permission</span>
              <span style={{ color: permColor }}>{notifPerm}</span>
              <span style={{ color: T.t3 }}>Service Worker API</span>
              <span style={{ color: typeof window !== 'undefined' && 'serviceWorker' in navigator ? '#4ade80' : T.red }}>
                {typeof window !== 'undefined' && 'serviceWorker' in navigator ? '✓ disponível' : '✗ indisponível'}
              </span>
              <span style={{ color: T.t3 }}>SW registrado</span>
              <span style={{ color: T.t2 }}>
                {typeof window !== 'undefined' && 'serviceWorker' in navigator
                  ? (navigator.serviceWorker.controller ? '✓ controlando esta página' : '⚠ aguardando primeira ativação (recarregue)')
                  : '–'}
              </span>
              <span style={{ color: T.t3 }}>Origem</span>
              <span style={{ color: T.t2 }}>
                {typeof window !== 'undefined' ? window.location.origin : '–'}
              </span>
              <span style={{ color: T.t3 }}>Foco do documento</span>
              <span style={{ color: T.t2 }}>
                {typeof document !== 'undefined' && document.hasFocus() ? 'em primeiro plano' : 'em segundo plano'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={sendTestNotification}
              style={{ padding: '10px 20px', borderRadius: 8, background: '#3b82f6', border: 'none', cursor: 'pointer', color: T.white, fontSize: 13, fontWeight: 700 }}
            >
              🧪 Disparar notificação de teste
            </button>
            <button
              onClick={async () => {
                if (!('serviceWorker' in navigator)) { showToast('SW não suportado'); return; }
                try {
                  await navigator.serviceWorker.register('/sw.js');
                  showToast('✅ Service worker registrado');
                } catch (e: any) {
                  showToast(`❌ Falha SW: ${e?.message || 'erro'}`);
                }
              }}
              style={{ padding: '10px 16px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.t2, fontSize: 12, fontWeight: 700 }}
            >
              Re-registrar SW
            </button>
          </div>

          <Txt size={11} color={T.t4} style={{ display: 'block', marginTop: 12, lineHeight: 1.5 }}>
            💡 Dica: minimize ou troque de aba antes de clicar — alguns navegadores escondem a notificação do SO se a aba estiver em foco.
            <br />💡 No macOS: confira <b>Ajustes do Sistema → Notificações → [seu navegador]</b> para garantir que pode mostrar notificações.
          </Txt>
        </div>

        {/* Compose notification */}
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Compor notificação</Txt>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <input
              style={S.input}
              placeholder="Título da notificação"
              value={newPush.title}
              onChange={e => setNewPush(p => ({ ...p, title: e.target.value }))}
            />
            <textarea
              style={{ ...S.input, minHeight: 70, resize: 'vertical' }}
              placeholder="Mensagem..."
              value={newPush.body}
              onChange={e => setNewPush(p => ({ ...p, body: e.target.value }))}
            />
            <select
              value={newPush.target}
              onChange={e => setNewPush(p => ({ ...p, target: e.target.value as PushNotif['target'] }))}
              style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, cursor: 'pointer' }}
            >
              <option value="all">Todos os usuários</option>
              <option value="vip">Apenas VIP</option>
              <option value="free">Apenas Free</option>
            </select>
          </div>

          {/* Schedule toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setSchedEnabled(v => !v)}
              style={{ width: 36, height: 20, borderRadius: 10, background: schedEnabled ? T.pink : T.surface2, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, background: T.white, position: 'absolute', top: 3, left: schedEnabled ? 19 : 3, transition: 'left 0.2s' }} />
            </button>
            <Txt size={13} color={T.t2}>Agendar envio</Txt>
          </div>

          {schedEnabled && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <input
                type="date"
                style={{ ...S.input, flex: 1 }}
                value={schedDate}
                onChange={e => setSchedDate(e.target.value)}
              />
              <input
                type="time"
                style={{ ...S.input, flex: 1 }}
                value={schedTime}
                onChange={e => setSchedTime(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            {!schedEnabled ? (
              <Btn label="Enviar agora" variant="primary" size="md" icon="bell" onClick={sendPushNow} />
            ) : (
              <Btn label={`Agendar para ${schedDate} às ${schedTime}`} variant="secondary" size="md" onClick={schedulePush} />
            )}
          </div>
        </div>

        {/* Auto-notify upcoming releases */}
        <div style={{ ...S.card, background: 'rgba(74,16,128,0.08)', border: '1px solid rgba(240,80,194,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(240,80,194,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Txt size={16}>🤖</Txt>
            </div>
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700} style={{ display: 'block' }}>Lançamentos automáticos</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4, lineHeight: 1.5 }}>
                Notifica automaticamente quando um novo episódio (das séries em "Quero ver" ou "Assistindo") ou estreia de filme estiver a {DAYS_THRESHOLD} dias ou menos do lançamento. Roda ao abrir a home e a cada 30 minutos.
              </Txt>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                if (notifPerm !== 'granted') { showToast('Habilite as notificações primeiro!'); return; }
                showToast('🔍 Verificando lançamentos…');
                const r = await checkUpcomingReleases();
                showToast(`✓ ${r.checked} verificados · ${r.fired} novas notificações · ${r.skipped} já enviadas`);
              }}
              style={{ padding: '9px 18px', borderRadius: 8, background: T.pink, border: 'none', cursor: 'pointer', color: T.white, fontSize: 13, fontWeight: 700 }}
            >
              🔍 Verificar agora
            </button>
            <button
              onClick={() => {
                notifiedStore.clear();
                showToast('Histórico de auto-notificações limpo');
              }}
              style={{ padding: '9px 18px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.t2, fontSize: 13, fontWeight: 700 }}
            >
              Limpar histórico
            </button>
            <Txt size={11} color={T.t4} style={{ alignSelf: 'center', marginLeft: 4 }}>
              {Object.keys(notifiedStore.get()).length} já notificados
            </Txt>
          </div>
        </div>

        {/* History */}
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Histórico</Txt>
          {pushList.length === 0 && <Txt size={13} color={T.t3}>Nenhuma notificação enviada ainda.</Txt>}
          {pushList.map((p, i) => (
            <div key={p.id} style={{ ...S.row, borderBottom: i < pushList.length - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: p.sent ? '#22c55e22' : '#f59e0b22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Txt size={14}>{p.sent ? '✓' : '⏰'}</Txt>
              </div>
              <div style={{ flex: 1 }}>
                <Txt size={13} weight={700} style={{ display: 'block' }}>{p.title}</Txt>
                <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>
                  {p.body.slice(0, 70)}{p.body.length > 70 ? '…' : ''}
                </Txt>
                <Txt size={10} color={T.t4} style={{ display: 'block', marginTop: 3 }}>
                  {p.target === 'all' ? '👥 Todos' : p.target === 'vip' ? '👑 VIP' : '🆓 Free'}
                  {p.scheduledAt ? ` · 📅 ${p.scheduledAt}` : ` · ${p.date}`}
                  {!p.sent && ' · Pendente'}
                </Txt>
              </div>
              {!p.sent && (
                <button
                  onClick={async () => {
                    await fireNotification(p.title, p.body);
                    const updated = pushList.map(x => x.id === p.id ? { ...x, sent: true } : x);
                    save('push', setPushList, updated);
                    showToast('🔔 Enviado!');
                  }}
                  style={{ padding: '5px 12px', borderRadius: 8, background: T.pink, border: 'none', cursor: 'pointer', color: T.white, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Enviar
                </button>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  /* ── Slider da Home ── */
  const SliderEditor = () => (
    <>
      <SectionTitle label="🎬 Slider da home" />

      {/* Info */}
      <div style={{ ...S.card, background: 'rgba(240,80,194,0.06)', border: '1px solid rgba(240,80,194,0.2)', marginBottom: 16 }}>
        <Txt size={13} color={T.t2} style={{ lineHeight: 1.6, display: 'block' }}>
          Adicione filmes e séries ao carrossel principal da home. Se o slider estiver vazio, a home exibirá automaticamente os títulos em tendência do TMDB.
        </Txt>
      </div>

      {/* Search */}
      <div style={S.card}>
        <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Buscar título no TMDB</Txt>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Ex: Severance, Duna, The Bear..."
            value={sliderQuery}
            onChange={e => setSliderQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchTMDB()}
          />
          <button
            onClick={searchTMDB}
            disabled={sliderSearching}
            style={{ padding: '10px 20px', borderRadius: 8, background: sliderSearching ? T.surface2 : T.pink, border: 'none', cursor: sliderSearching ? 'default' : 'pointer', color: T.white, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {sliderSearching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {/* Search results */}
        {sliderResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sliderResults.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                {item.backdrop_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://image.tmdb.org/t/p/w92${item.backdrop_path}`}
                    alt={item.title}
                    style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 60, height: 34, borderRadius: 4, background: T.surface, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Txt size={10} color={T.t4}>Sem img</Txt>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={13} weight={700} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                    <span style={S.tag(item.type === 'tv' ? '#3b82f6' : T.red)}>{item.type === 'tv' ? 'Série' : 'Filme'}</span>
                  </div>
                </div>
                <button
                  onClick={() => addToSlider(item)}
                  style={{ padding: '6px 14px', borderRadius: 8, background: sliderItems.some(s => s.id === item.id) ? T.surface2 : '#22c55e22', border: `1px solid ${sliderItems.some(s => s.id === item.id) ? T.border : '#22c55e44'}`, cursor: sliderItems.some(s => s.id === item.id) ? 'default' : 'pointer', color: sliderItems.some(s => s.id === item.id) ? T.t4 : '#4ade80', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {sliderItems.some(s => s.id === item.id) ? '✓ Adicionado' : '+ Adicionar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current slider items */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Txt size={14} weight={700}>
            Slider atual
            <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 8, background: T.surface2, fontSize: 11, fontWeight: 700, color: T.t3 }}>
              {sliderItems.length} {sliderItems.length === 1 ? 'item' : 'itens'}
            </span>
          </Txt>
          {sliderItems.length > 0 && (
            <button
              onClick={() => { setSliderItems([]); sliderStore.set([]); showToast('Slider limpo'); }}
              style={{ padding: '5px 12px', borderRadius: 8, background: T.redDim, border: `1px solid rgba(239,68,68,0.2)`, cursor: 'pointer', color: T.red, fontSize: 12, fontWeight: 700 }}
            >
              Limpar tudo
            </button>
          )}
        </div>

        {sliderItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Txt size={13} color={T.t4} style={{ display: 'block' }}>Nenhum item no slider.</Txt>
            <Txt size={12} color={T.t4} style={{ display: 'block', marginTop: 6 }}>Busque um título acima para adicionar ao slider.</Txt>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sliderItems.map((item, idx) => (
              <div key={item.id} style={{ borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  <Txt size={12} color={T.t4} style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</Txt>
                  {item.backdrop_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://image.tmdb.org/t/p/w92${item.backdrop_path}`} alt={item.title}
                      style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 60, height: 34, borderRadius: 4, background: T.surface, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={13} weight={700} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Txt>
                    <span style={{ ...S.tag(item.type === 'tv' ? '#3b82f6' : T.red), display: 'inline-block', marginTop: 3 }}>
                      {item.type === 'tv' ? 'Série' : 'Filme'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => moveSlider(idx, 'up')} disabled={idx === 0}
                      style={{ width: 24, height: 22, borderRadius: 4, background: idx === 0 ? 'transparent' : T.surface, border: `1px solid ${T.border}`, cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? T.t4 : T.t2, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>
                    <button onClick={() => moveSlider(idx, 'down')} disabled={idx === sliderItems.length - 1}
                      style={{ width: 24, height: 22, borderRadius: 4, background: idx === sliderItems.length - 1 ? 'transparent' : T.surface, border: `1px solid ${T.border}`, cursor: idx === sliderItems.length - 1 ? 'default' : 'pointer', color: idx === sliderItems.length - 1 ? T.t4 : T.t2, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>
                  </div>
                  <button onClick={() => removeFromSlider(item.id)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: T.redDim, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="close" size={12} color={T.red} />
                  </button>
                </div>
                {/* Edit row: buttonText + category */}
                <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px', borderTop: `1px solid ${T.border}` }}>
                  <div style={{ flex: 1 }}>
                    <Txt size={10} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 4, marginTop: 8 }}>TEXTO DO BOTÃO</Txt>
                    <input
                      value={item.buttonText || ''}
                      onChange={e => updateSliderItem(item.id, { buttonText: e.target.value })}
                      placeholder="Quero ver"
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.t1, fontFamily: "'Area','Inter',sans-serif", outline: 'none' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Txt size={10} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 4, marginTop: 8 }}>CATEGORIA</Txt>
                    <select
                      value={item.category || ''}
                      onChange={e => updateSliderItem(item.id, { category: (e.target.value || null) as import('@/lib/store').SliderCategory })}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.t1, fontFamily: "'Area','Inter',sans-serif", outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="">Sem categoria</option>
                      <option value="nos_cinemas">🎬 Nos cinemas</option>
                      <option value="no_streaming">📺 No streaming</option>
                      <option value="em_breve">🕐 Em breve</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const Usuarios = () => (
    <>
      <SectionTitle label="👤 Usuários cadastrados" />
      <div style={S.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
          {['Nome', 'E-mail', 'Plano', 'Cadastro', 'Títulos'].map(h => (
            <Txt key={h} size={11} weight={700} color={T.t3}>{h}</Txt>
          ))}
        </div>
        {users.map((u, i) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', gap: 8, padding: '10px 0', borderBottom: i < users.length - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'center' }}>
            <Txt size={13} weight={600}>{u.name}</Txt>
            <Txt size={12} color={T.t2}>{u.email}</Txt>
            <span style={S.tag(u.plan === 'vip' ? T.gold : T.surface2)}>{u.plan.toUpperCase()}</span>
            <Txt size={11} color={T.t3}>{u.joined}</Txt>
            <Txt size={12} color={T.t2}>{u.titles}</Txt>
          </div>
        ))}
      </div>
    </>
  );

  const VIP = () => {
    const plans = [
      { name: 'Mensal', price: 'R$ 12,90', subs: 1, revenue: 'R$ 12,90', color: T.pink },
      { name: 'Trimestral', price: 'R$ 34,90', subs: 0, revenue: 'R$ 0,00', color: '#a78bfa' },
      { name: 'Anual', price: 'R$ 99,90', subs: 0, revenue: 'R$ 0,00', color: T.gold },
    ];
    return (
      <>
        <SectionTitle label="👑 Controle de assinaturas VIP" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {plans.map(p => (
            <div key={p.name} style={{ ...S.card, borderTop: `3px solid ${p.color}`, marginBottom: 0 }}>
              <Txt size={15} weight={800} style={{ display: 'block', marginBottom: 6 }}>{p.name}</Txt>
              <Txt size={22} weight={900} color={p.color} style={{ display: 'block' }}>{p.price}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 6 }}>{p.subs} assinantes · {p.revenue}/mês</Txt>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Benefícios VIP</Txt>
          {['Sem anúncios', 'Acesso antecipado a lançamentos', 'Recomendações IA ilimitadas', 'Badge exclusivo no perfil', 'Suporte prioritário'].map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < 4 ? `1px solid ${T.border}` : 'none' }}>
              <Icon name="check" size={14} color={T.gold} />
              <Txt size={13}>{b}</Txt>
            </div>
          ))}
        </div>
      </>
    );
  };

  const Lancamentos = () => {
    const add = () => {
      if (!newLaunch.title.trim()) return;
      const updated = [...launches, { id: uid(), ...newLaunch, highlight: false }];
      save('launches', setLaunches, updated);
      setNewLaunch({ title: '', type: 'movie', date: today(), platform: 'Netflix' });
      showToast('Lançamento adicionado');
    };
    const toggle = (id: string) => save('launches', setLaunches, launches.map(l => l.id === id ? { ...l, highlight: !l.highlight } : l));
    const remove = (id: string) => { save('launches', setLaunches, launches.filter(l => l.id !== id)); showToast('Removido'); };
    const PLATFORMS = ['Netflix', 'Prime', 'Disney+', 'HBO', 'Apple', 'Globo', 'Paramount'];
    return (
      <>
        <SectionTitle label="🚀 Lançamentos do dia/semana" />
        <div style={S.card}>
          <Txt size={14} weight={700} style={{ display: 'block', marginBottom: 12 }}>Adicionar lançamento</Txt>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={S.input} placeholder="Título" value={newLaunch.title} onChange={e => setNewLaunch(p => ({ ...p, title: e.target.value }))} />
            <select value={newLaunch.type} onChange={e => setNewLaunch(p => ({ ...p, type: e.target.value as 'movie'|'tv' }))}
              style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, cursor: 'pointer' }}>
              <option value="movie">Filme</option>
              <option value="tv">Série</option>
            </select>
            <input type="date" style={S.input} value={newLaunch.date} onChange={e => setNewLaunch(p => ({ ...p, date: e.target.value }))} />
            <select value={newLaunch.platform} onChange={e => setNewLaunch(p => ({ ...p, platform: e.target.value }))}
              style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.white, fontSize: 13, cursor: 'pointer' }}>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <Btn label="Adicionar" variant="pink" size="sm" onClick={add} />
        </div>
        {launches.map((l) => (
          <div key={l.id} style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <span style={S.tag(l.type === 'tv' ? '#3b82f6' : T.red)}>{l.type === 'tv' ? 'Série' : 'Filme'}</span>
            <Txt size={14} weight={700} style={{ flex: 1 }}>{l.title}</Txt>
            <Txt size={12} color={T.t3}>{l.platform} · {l.date}</Txt>
            <button onClick={() => toggle(l.id)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: l.highlight ? '#f59e0b22' : T.surface2, color: l.highlight ? T.gold : T.t3, fontWeight: 700, fontSize: 11 }}>
              {l.highlight ? '★ Destaque' : 'Destacar'}
            </button>
            <button onClick={() => remove(l.id)} style={{ background: T.redDim, border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}>
              <Icon name="close" size={12} color={T.red} />
            </button>
          </div>
        ))}
      </>
    );
  };

  const Moderacao = () => {
    const approve = (id: string) => save('reviews', setReviews, reviews.map(r => r.id === id ? { ...r, approved: true, flagged: false } : r));
    const reject  = (id: string) => save('reviews', setReviews, reviews.filter(r => r.id !== id));
    return (
      <>
        <SectionTitle label="🛡 Moderação de avaliações" />
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={S.statCard}><Txt size={24} weight={900} color={T.red} style={{ display: 'block' }}>{reviews.filter(r => r.flagged).length}</Txt><Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4 }}>Sinalizadas</Txt></div>
          <div style={S.statCard}><Txt size={24} weight={900} color={'#4ade80'} style={{ display: 'block' }}>{reviews.filter(r => r.approved).length}</Txt><Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4 }}>Aprovadas</Txt></div>
          <div style={S.statCard}><Txt size={24} weight={900} color={T.t2} style={{ display: 'block' }}>{reviews.length}</Txt><Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4 }}>Total</Txt></div>
        </div>
        {reviews.map(r => (
          <div key={r.id} style={{ ...S.card, borderLeft: `3px solid ${r.flagged ? T.red : r.approved ? '#22c55e' : T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Txt size={13} weight={700}>{r.user}</Txt>
                <Txt size={12} color={T.t3}>em <b>{r.title}</b></Txt>
                {r.flagged && <span style={S.tag(T.red)}>⚑ Sinalizado</span>}
                {r.approved && <span style={S.tag('#166534')}>✓ Aprovado</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[...Array(5)].map((_, i) => <Icon key={i} name="star" size={11} color={i < r.rating ? T.gold : T.t4} />)}
              </div>
            </div>
            <Txt size={13} color={T.t2} style={{ display: 'block', marginBottom: 12 }}>"{r.text}"</Txt>
            <div style={{ display: 'flex', gap: 8 }}>
              {!r.approved && <Btn label="Aprovar" variant="secondary" size="sm" onClick={() => approve(r.id)} />}
              <Btn label="Remover" variant="danger" size="sm" onClick={() => reject(r.id)} />
            </div>
          </div>
        ))}
      </>
    );
  };

  const SECTION_MAP: Record<AdminSection, React.ReactNode> = {
    metrics:      <Metrics />,
    destaques:    <Destaques />,
    banners:      <Banners />,
    noticias:     <Noticias />,
    notificacoes: <Notificacoes />,
    slider:       <SliderEditor />,
    usuarios:     <Usuarios />,
    vip:          <VIP />,
    lancamentos:  <Lancamentos />,
    moderacao:    <Moderacao />,
  };

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="crown" size={14} color={T.white} />
          </div>
          {sideOpen && <Txt size={13} weight={800} color={T.white} style={{ whiteSpace: 'nowrap' }}>SEC TIME Admin</Txt>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV.map(n => (
            <div key={n.id} style={S.navItem(section === n.id)} onClick={() => setSection(n.id)}>
              <Icon name={n.icon as Parameters<typeof Icon>[0]['name']} size={16} color={section === n.id ? T.pink : T.t3} />
              {sideOpen && <span>{n.label}</span>}
            </div>
          ))}
        </div>
        <button onClick={() => setSideOpen(o => !o)} style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${T.border}`, color: T.t3 }}>
          <Icon name={sideOpen ? 'chevronLeft' : 'chevronRight'} size={16} color={T.t3} />
          {sideOpen && <Txt size={12} color={T.t3}>Recolher</Txt>}
        </button>
      </div>

      {/* Main content */}
      <div style={S.main}>
        {SECTION_MAP[section]}
      </div>

      <Toast msg={toast} visible={!!toast} icon="check" />
    </div>
  );
}
