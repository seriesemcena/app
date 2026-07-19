'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbActivityStore } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { navigateBack } from '@/lib/navigation';
import i18next from 'i18next';
import '@/lib/i18n';

interface RankEntry {
  uid:      string;
  name:     string;
  username: string;
  gradient: string;
  photoUrl: string;
  hours:    number;
  reviews:  number;
  score:    number;
  isMe:     boolean;
}


const MEDAL_COLORS = ['#F5C518', '#9CA3AF', '#CD7F32'];

export default function RankingPage() {
  const router   = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation('home');

  const MONTH = new Intl.DateTimeFormat(i18next.language || 'pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date())
    .replace(/^\w/, c => c.toUpperCase());

  const [ranking,  setRanking]  = useState<RankEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (authLoading) return;  // aguardar auth resolver antes de acessar Firestore
    if (!firebaseConfigured) {
      setError(t('errors.firebase', { ns: 'errors', defaultValue: 'Firebase não configurado.' }));
      setLoading(false);
      return;
    }
    if (!user) {
      setError(t('errors.loginRequired', { ns: 'errors', defaultValue: 'Faça login para ver o ranking.' }));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const db = getDB();

        /* 1. Buscar atividade recente para contar reviews e títulos assistidos por uid */
        const activities = await dbActivityStore.getRecent(db, 500);

        const reviewsByUid: Record<string, number> = {};
        const watchedByUid: Record<string, number> = {};
        const metaByUid:    Record<string, { username: string; avatar: string; photoUrl: string }> = {};

        activities.forEach(a => {
          if (!a.uid) return;
          if (a.action === 'reviewed') reviewsByUid[a.uid] = (reviewsByUid[a.uid] || 0) + 1;
          if (a.action === 'watched')  watchedByUid[a.uid] = (watchedByUid[a.uid] || 0) + 1;
          // guarda metadados do usuário vindos da activity (mais recente prevalece)
          if (!metaByUid[a.uid]) {
            metaByUid[a.uid] = { username: a.username || '', avatar: a.avatar || '', photoUrl: a.photoUrl || '' };
          }
        });

        /* 2. Garantir que o usuário atual também apareça */
        const activeUids = new Set(Object.keys(reviewsByUid).concat(Object.keys(watchedByUid)));
        if (user?.uid) activeUids.add(user.uid);

        /* 3. Buscar perfil de cada uid ativo individualmente (getDoc é permitido pelas regras) */
        const entries: RankEntry[] = (
          await Promise.all(
            Array.from(activeUids).map(async uid => {
              const snap    = await getDoc(doc(db, 'users', uid));
              const data    = snap.exists() ? (snap.data() as any) : {};
              const profile = data.profile || metaByUid[uid] || {};
              const watched = Array.isArray(data.lists_watched) ? data.lists_watched.length
                            : (watchedByUid[uid] || 0);
              const hours   = Math.round(watched * 1.5);
              const reviews = reviewsByUid[uid] || 0;
              const score   = hours + reviews * 3;
              return {
                uid,
                name:     profile.name || profile.username || metaByUid[uid]?.avatar || 'Usuário',
                username: profile.username || uid.slice(0, 8),
                gradient: profile.avatarGradient || `linear-gradient(135deg,${T.pink},#8B2FFF)`,
                photoUrl: profile.avatarImage || metaByUid[uid]?.photoUrl || '',
                hours,
                reviews,
                score,
                isMe: uid === user?.uid,
              } as RankEntry;
            })
          )
        )
          .filter(e => e.score > 0 || e.isMe)
          .sort((a, b) => b.score - a.score);

        setRanking(entries);
      } catch (e) {
        setError(t('errors.loadFailed', { ns: 'errors', defaultValue: 'Não foi possível carregar o ranking.' }));
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  const myRank = ranking.findIndex(e => e.isMe) + 1;
  const myEntry = myRank > 0 ? ranking[myRank - 1] : undefined;

  /* Pódio: 2º (esq), 1º (centro), 3º (dir) */
  const podiumSlots = [
    { entry: top3[1], rank: 2, height: 82, color: MEDAL_COLORS[1], surface: 'rgba(156,163,175,0.16)' },
    { entry: top3[0], rank: 1, height: 116, color: T.pink, surface: 'rgba(192,105,255,0.24)' },
    { entry: top3[2], rank: 3, height: 66, color: MEDAL_COLORS[2], surface: 'rgba(205,127,50,0.14)' },
  ];

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <div style={{ minHeight: '100%', background: `radial-gradient(circle at 50% 16%, rgba(192,105,255,0.12), transparent 34%)` }}>
            <GlassHeader
              left={
                <button
                  onClick={() => navigateBack(router)}
                  aria-label="Voltar"
                  style={{ width: 36, height: 36, borderRadius: 18, background: T.glassBg, border: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}
                >
                  <Icon name="chevronL" size={17} color={T.t1} />
                </button>
              }
              right={
                <button
                  onClick={() => router.push('/notifications')}
                  aria-label="Notificações"
                  style={{ width: 36, height: 36, borderRadius: 18, background: T.glassBg, border: `1px solid ${T.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}
                >
                  <Icon name="bell" size={17} color={T.t1} />
                </button>
              }
            />

            <div style={{ width: '100%', maxWidth: 720, margin: '0 auto', padding: '18px 16px 0', boxSizing: 'border-box' }}>
              {/* ── Título ── */}
              <div style={{ textAlign: 'center' }}>
                <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.45px' }}>
                  {t('ranking.title')}
                </Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 4 }}>
                  {t('ranking.challenge', { month: MONTH })}
                </Txt>
              </div>

              {/* ── Loading ── */}
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 24px', gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, border: `3px solid ${T.pink}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                  <Txt size={13} color={T.t3}>{t('ranking.loading')}</Txt>
                </div>
              )}

              {/* ── Erro ── */}
              {!loading && error && (
                <div style={{ marginTop: 32, padding: '24px 20px', borderRadius: T.radius, background: T.card, border: `1px solid ${T.border}`, textAlign: 'center' }}>
                  <Icon name="info" size={26} color={T.t4} />
                  <Txt size={14} color={T.t3} style={{ display: 'block', marginTop: 10 }}>{error}</Txt>
                </div>
              )}

              {/* ── Ranking vazio ── */}
              {!loading && !error && ranking.length === 0 && (
                <div style={{ marginTop: 32, padding: '44px 24px', borderRadius: T.radius, background: T.card, border: `1px solid ${T.border}`, textAlign: 'center' }}>
                  <Icon name="award" size={34} color={T.t4} />
                  <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>{t('ranking.noUsers')}</Txt>
                  <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>{t('ranking.noUsersDetail')}</Txt>
                </div>
              )}

              {!loading && !error && ranking.length > 0 && (
                <>
                  {/* ── Participantes do pódio ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end', marginTop: 30 }}>
                    {podiumSlots.map(({ entry: u, rank, color }) => {
                      const isFirst = rank === 1;
                      const avatarSize = isFirst ? 86 : 68;
                      return (
                        <button
                          type="button"
                          key={rank}
                          onClick={() => u && !u.isMe && router.push(`/user/${encodeURIComponent(u.username)}`)}
                          disabled={!u || u.isMe}
                          style={{ minWidth: 0, padding: `0 2px ${isFirst ? 0 : 12}px`, border: 'none', background: 'none', cursor: u && !u.isMe ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                        >
                          <div style={{ width: avatarSize + 8, height: avatarSize + 8, padding: 3, borderRadius: '50%', background: u ? `linear-gradient(145deg, ${color}, ${color}88)` : T.surface2, boxShadow: u ? (isFirst ? `0 0 0 3px ${T.pink}26, 0 10px 32px ${T.pink}45` : `0 7px 20px ${color}30`) : 'none' }}>
                            <div style={{ width: avatarSize, height: avatarSize, borderRadius: '50%', background: u ? (u.photoUrl ? `url(${u.photoUrl}) center/cover no-repeat` : u.gradient) : T.surface, border: `2px solid ${T.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxSizing: 'border-box' }}>
                              {u ? (!u.photoUrl && <Txt size={isFirst ? 28 : 22} weight={900} color="#fff">{u.name[0]?.toUpperCase()}</Txt>) : <Icon name="award" size={22} color={T.t4} />}
                            </div>
                          </div>
                          <Txt size={isFirst ? 15 : 13} weight={800} color={u?.isMe ? T.pink : T.t1} style={{ display: 'block', width: '100%', marginTop: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {u ? (u.isMe ? t('ranking.you') : u.name.split(' ')[0]) : t('ranking.openSpot')}
                          </Txt>
                          <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{u ? `${u.score} pts` : '—'}</Txt>
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Pedestais ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end', marginTop: 14 }}>
                    {podiumSlots.map(({ rank, height, color, surface }) => (
                      <div key={rank} style={{ height, borderRadius: '18px 18px 5px 5px', background: `linear-gradient(180deg, ${surface}, transparent)`, border: `1px solid ${color}32`, borderBottomColor: `${color}12`, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent, ${color}0C, transparent)`, pointerEvents: 'none' }} />
                        <div style={{ width: rank === 1 ? 38 : 32, height: rank === 1 ? 38 : 32, borderRadius: 20, background: `${color}22`, border: `1px solid ${color}80`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: rank === 1 ? `0 0 18px ${color}50` : 'none' }}>
                          <Txt size={rank === 1 ? 16 : 13} weight={900} color={rank === 1 ? '#fff' : color}>{rank}</Txt>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Atualização e fórmula ── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, padding: '13px 8px 0', textAlign: 'center' }}>
                    <Icon name="chart" size={13} color={T.t3} />
                    <Txt size={11} color={T.t3}>{t('ranking.scoreFormula')}</Txt>
                    <Txt size={10} color={T.t3}>•</Txt>
                    <Txt size={11} color={T.t3}>{t('ranking.updatedNow')}</Txt>
                  </div>

                  {/* ── Outros participantes ── */}
                  <div style={{ marginTop: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 26, overflow: 'hidden', boxShadow: '0 12px 34px rgba(0,0,0,0.10)' }}>
                    <div style={{ padding: '18px 18px 14px', textAlign: 'center' }}>
                      <Txt size={15} weight={800} color={T.t1}>{t('ranking.others')}</Txt>
                    </div>
                    {rest.length === 0 ? (
                      <div style={{ padding: '6px 20px 24px', textAlign: 'center' }}>
                        <Txt size={12} color={T.t3}>{t('ranking.emptyOthers')}</Txt>
                      </div>
                    ) : rest.map((u, i) => (
                      <button
                        type="button"
                        key={u.uid}
                        onClick={() => !u.isMe && router.push(`/user/${encodeURIComponent(u.username)}`)}
                        disabled={u.isMe}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', border: 'none', borderTop: `1px solid ${T.border}`, cursor: u.isMe ? 'default' : 'pointer', background: u.isMe ? 'rgba(192,105,255,0.07)' : 'transparent', textAlign: 'left' }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: u.isMe ? T.pink : T.surface2, border: `1px solid ${u.isMe ? T.pink : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Txt size={11} weight={900} color={u.isMe ? '#fff' : T.t3}>{i + 4}</Txt>
                        </div>
                        <div style={{ width: 42, height: 42, borderRadius: 21, flexShrink: 0, background: u.photoUrl ? `url(${u.photoUrl}) center/cover no-repeat` : u.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', border: u.isMe ? `2px solid ${T.pink}` : `2px solid ${T.border}`, overflow: 'hidden' }}>
                          {!u.photoUrl && <Txt size={15} weight={800} color="#fff">{u.name[0]?.toUpperCase()}</Txt>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Txt size={14} weight={700} color={u.isMe ? T.pink : T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.isMe ? `${t('ranking.you')} (${u.name.split(' ')[0]})` : u.name}
                          </Txt>
                          <Txt size={11} color={T.t3}>{u.hours}h · {u.reviews} aval.</Txt>
                        </div>
                        <Txt size={13} weight={800} color={T.t2}>{u.score} pts</Txt>
                      </button>
                    ))}
                  </div>

                  {/* ── Resumo da minha posição ── */}
                  {myEntry && (
                    <div style={{ position: 'sticky', bottom: 'calc(var(--tab-h, 84px) + 10px)', zIndex: 20, width: 'calc(100% - 24px)', maxWidth: 520, margin: '18px auto 0', padding: '10px 12px', borderRadius: 24, background: 'color-mix(in srgb, var(--c-card) 88%, transparent)', border: `1px solid ${T.border}`, boxShadow: '0 12px 34px rgba(0,0,0,0.22)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box' } as React.CSSProperties}>
                      <div style={{ width: 34, height: 34, borderRadius: 17, background: myRank <= 3 ? 'rgba(245,197,24,0.15)' : 'rgba(192,105,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={myRank <= 3 ? 'crown' : 'award'} size={17} color={myRank <= 3 ? T.gold : T.pink} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Txt size={11} color={T.t3} style={{ display: 'block' }}>{t('ranking.position')}</Txt>
                        <Txt size={13} weight={800} color={T.t1}>#{myRank} · {myEntry.score} pts</Txt>
                      </div>
                      <Txt size={11} weight={700} color={T.pink}>{t('ranking.myRankDetail')}</Txt>
                    </div>
                  )}
                </>
              )}

              <div style={{ height: 110 }} />
            </div>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
