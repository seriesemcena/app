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

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
  .format(new Date())
  .replace(/^\w/, c => c.toUpperCase());

const MEDAL_COLORS = ['#F5C518', '#9CA3AF', '#CD7F32'];
const MEDAL_TEXT   = ['#1a1400', '#fff', '#fff'];

export default function RankingPage() {
  const router   = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [ranking,  setRanking]  = useState<RankEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (authLoading) return;  // aguardar auth resolver antes de acessar Firestore
    if (!firebaseConfigured) {
      setError('Firebase não configurado.');
      setLoading(false);
      return;
    }
    if (!user) {
      setError('Faça login para ver o ranking.');
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
        setError('Não foi possível carregar o ranking.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);
  /* Pódio: 2º (esq), 1º (centro), 3º (dir) */
  const podiumOrder  = [top3[1], top3[0], top3[2]];
  const podiumRanks  = [1, 0, 2];

  const myRank = ranking.findIndex(e => e.isMe) + 1;

  return (
    <Frame>
      <Screen>
        <ScrollArea>
          <GlassHeader
            left={
              <button
                onClick={() => router.back()}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}
              >
                <Icon name="chevronL" size={16} color="#fff" />
              </button>
            }
            right={
              <button
                onClick={() => router.push('/notifications')}
                style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as React.CSSProperties}
              >
                <Icon name="bell" size={16} color="#fff" />
              </button>
            }
          />
          {/* ── Título ── */}
          <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
            <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', letterSpacing: '-0.4px' }}>
              Ranking do Mês
            </Txt>
            <Txt size={13} color={T.t3} style={{ display: 'block', marginTop: 4 }}>
              {MONTH} · Horas assistidas + avaliações
            </Txt>
          </div>

          {/* ── Loading ── */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, border: `3px solid ${T.pink}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <Txt size={13} color={T.t3}>Carregando ranking...</Txt>
            </div>
          )}

          {/* ── Erro ── */}
          {!loading && error && (
            <div style={{ margin: '32px 16px', padding: '20px', borderRadius: T.radius, background: T.card, border: `1px solid ${T.border}`, textAlign: 'center' }}>
              <Icon name="info" size={24} color={T.t4} />
              <Txt size={14} color={T.t3} style={{ display: 'block', marginTop: 10 }}>{error}</Txt>
            </div>
          )}

          {/* ── Ranking vazio ── */}
          {!loading && !error && ranking.length === 0 && (
            <div style={{ margin: '32px 16px', padding: '40px 24px', borderRadius: T.radius, background: T.card, border: `1px solid ${T.border}`, textAlign: 'center' }}>
              <Icon name="award" size={32} color={T.t4} />
              <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', marginTop: 14, marginBottom: 6 }}>Nenhum maratonador ainda</Txt>
              <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.5 }}>Assista títulos e publique avaliações para entrar no ranking.</Txt>
            </div>
          )}

          {/* ── Pódio ── */}
          {!loading && !error && ranking.length > 0 && (
            <>
              <div style={{ padding: '32px 16px 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {podiumOrder.map((u, i) => {
                  if (!u) return <div key={i} style={{ flex: 1 }} />;
                  const rank    = podiumRanks[i];
                  const isFirst = rank === 0;
                  const size    = isFirst ? 80 : 64;
                  const mColor  = MEDAL_COLORS[rank];
                  const mText   = MEDAL_TEXT[rank];

                  return (
                    <div
                      key={u.uid}
                      onClick={() => !u.isMe && router.push(`/user/${encodeURIComponent(u.username)}`)}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: u.isMe ? 'default' : 'pointer', paddingBottom: isFirst ? 0 : 12 }}
                    >
                      <div style={{ position: 'relative' }}>
                        <div style={{ width: size + 8, height: size + 8, borderRadius: '50%', background: mColor, padding: 3, boxShadow: isFirst ? `0 0 0 3px ${mColor}40, 0 8px 28px ${mColor}50` : `0 4px 16px ${mColor}30` }}>
                          <div style={{ width: size, height: size, borderRadius: '50%', background: u.photoUrl ? `url(${u.photoUrl}) center/cover no-repeat` : u.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `2px solid ${T.bg}` }}>
                            {!u.photoUrl && <Txt size={isFirst ? 28 : 22} weight={900} color="#fff">{u.name[0]?.toUpperCase()}</Txt>}
                          </div>
                        </div>
                        <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 22, height: 22, borderRadius: 11, background: mColor, border: `2px solid ${T.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                          <Txt size={10} weight={900} color={mText}>{rank + 1}</Txt>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', marginTop: 6 }}>
                        <Txt size={isFirst ? 15 : 13} weight={isFirst ? 800 : 700} color={u.isMe ? T.pink : T.t1} style={{ display: 'block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.isMe ? 'Você' : u.name.split(' ')[0]}
                        </Txt>
                        <Txt size={11} color={T.t3} style={{ display: 'block' }}>{u.score} pts</Txt>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Degraus */}
              <div style={{ display: 'flex', alignItems: 'flex-end', margin: '0 16px', gap: 6 }}>
                <div style={{ flex: 1, height: 52, borderRadius: '12px 12px 0 0', background: 'rgba(156,163,175,0.10)', border: '1px solid rgba(156,163,175,0.18)', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={18} color="rgba(156,163,175,0.4)" weight={900}>2</Txt>
                </div>
                <div style={{ flex: 1, height: 76, borderRadius: '12px 12px 0 0', background: 'rgba(245,197,24,0.10)', border: '1px solid rgba(245,197,24,0.22)', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={22} color="rgba(245,197,24,0.45)" weight={900}>1</Txt>
                </div>
                <div style={{ flex: 1, height: 36, borderRadius: '12px 12px 0 0', background: 'rgba(205,127,50,0.10)', border: '1px solid rgba(205,127,50,0.18)', borderBottom: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Txt size={14} color="rgba(205,127,50,0.4)" weight={900}>3</Txt>
                </div>
              </div>

              {/* Nota + legenda da pontuação */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="chart" size={12} color={T.t4} />
                  <Txt size={11} color={T.t4}>Pontuação = horas assistidas + avaliações × 3</Txt>
                </div>
              </div>

              {/* ── Minha posição (se fora do top 3) ── */}
              {myRank > 3 && myRank > 0 && (
                <div style={{ margin: '16px 16px 0', padding: '12px 16px', borderRadius: T.radiusSm, background: 'rgba(192,105,255,0.08)', border: `1px solid ${T.pink}30`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Txt size={12} weight={900} color="#fff">{myRank}</Txt>
                  </div>
                  <div>
                    <Txt size={13} weight={700} color={T.pink} style={{ display: 'block' }}>Sua posição no ranking</Txt>
                    <Txt size={11} color={T.t3}>Continue maratonando para subir!</Txt>
                  </div>
                  <Txt size={14} weight={800} color={T.t1} style={{ marginLeft: 'auto' }}>
                    {ranking[myRank - 1]?.score ?? 0} pts
                  </Txt>
                </div>
              )}

              {myRank > 0 && myRank <= 3 && (
                <div style={{ margin: '16px 16px 0', padding: '12px 16px', borderRadius: T.radiusSm, background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.22)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="crown" size={16} color={T.gold} />
                  <Txt size={13} weight={700} color={T.gold}>Você está no top 3! Continue assim 🎉</Txt>
                </div>
              )}

              {/* ── Outros participantes ── */}
              {rest.length > 0 && (
                <div style={{ margin: '16px 16px 0' }}>
                  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px 12px' }}>
                      <Txt size={15} weight={800} color={T.t1}>Outros participantes</Txt>
                    </div>
                    {rest.map((u, i) => (
                      <div
                        key={u.uid}
                        onClick={() => !u.isMe && router.push(`/user/${encodeURIComponent(u.username)}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${T.border}`, cursor: u.isMe ? 'default' : 'pointer', background: u.isMe ? 'rgba(192,105,255,0.06)' : 'transparent' }}
                      >
                        <Txt size={13} weight={700} color={T.t4} style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 4}</Txt>
                        <div style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: u.photoUrl ? `url(${u.photoUrl}) center/cover no-repeat` : u.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', border: u.isMe ? `2px solid ${T.pink}` : '2px solid transparent', overflow: 'hidden' }}>
                          {!u.photoUrl && <Txt size={15} weight={800} color="#fff">{u.name[0]?.toUpperCase()}</Txt>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Txt size={14} weight={700} color={u.isMe ? T.pink : T.t1} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.isMe ? `Você (${u.name.split(' ')[0]})` : u.name}
                          </Txt>
                          <Txt size={11} color={T.t3}>{u.hours}h · {u.reviews} aval.</Txt>
                        </div>
                        <Txt size={13} weight={700} color={T.t2}>{u.score} pts</Txt>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ height: 90 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
