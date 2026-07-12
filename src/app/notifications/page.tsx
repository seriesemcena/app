'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, GlassHeader, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { notifInboxStore, listStore, type InboxNotif } from '@/lib/store';

/* ── Icon map per notification type ── */
const TYPE_ICON: Record<InboxNotif['type'], string> = {
  new_episode: 'play',
  like:        'heart',
  reply:       'message',
  follow:      'user',
  release:     'star',
  general:     'bell',
};
const TYPE_COLOR: Record<InboxNotif['type'], string> = {
  new_episode: '#60a5fa',
  like:        T.pink,
  reply:       '#a78bfa',
  follow:      '#4ade80',
  release:     T.gold,
  general:     T.t3,
};

/* ── Seed sample notifications from the user's watchlist (runs once) ── */
function seedIfEmpty() {
  const existing = notifInboxStore.get();
  if (existing.length > 0) return;

  const watching = listStore.get('watching');
  const want     = listStore.get('want');
  const now      = Date.now();
  const ms       = (h: number) => h * 60 * 60 * 1000;

  const seeds: InboxNotif[] = [];

  watching.slice(0, 2).forEach((item, i) => {
    seeds.push({
      id: `seed_ep_${item.id}`,
      type: 'new_episode',
      title: `Novo episódio disponível`,
      body: `Um novo episódio de "${item.title}" está disponível para assistir.`,
      time: new Date(now - ms(i * 6 + 2)).toISOString(),
      read: false,
    });
  });

  want.slice(0, 1).forEach((item) => {
    seeds.push({
      id: `seed_rel_${item.id}`,
      type: 'release',
      title: `Chegou ao streaming!`,
      body: `"${item.title}" agora está disponível em uma das plataformas que você usa.`,
      time: new Date(now - ms(30)).toISOString(),
      read: false,
    });
  });

  // Always add a generic welcome notif
  seeds.push({
    id: 'seed_welcome',
    type: 'general',
    title: 'Bem-vindo ao Maratonou! 🎉',
    body: 'Adicione séries e filmes às suas listas para receber notificações sobre novos episódios e lançamentos.',
    time: new Date(now - ms(48)).toISOString(),
    read: false,
  });

  seeds.forEach(n => notifInboxStore.add(n));
}

/* ── Group notifications by day label ── */
function groupByDay(items: InboxNotif[]): Array<{ label: string; items: InboxNotif[] }> {
  const groups: Record<string, InboxNotif[]> = {};
  const now = new Date();

  for (const n of items) {
    const d = new Date(n.time);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    let label: string;
    if (diffDays === 0) label = 'Hoje';
    else if (diffDays === 1) label = 'Ontem';
    else if (diffDays < 7) label = `${diffDays} dias atrás`;
    else label = 'Esta semana';
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }

  // Maintain order: Hoje → Ontem → N dias → Esta semana
  const order = ['Hoje', 'Ontem', '2 dias atrás', '3 dias atrás', '4 dias atrás', '5 dias atrás', '6 dias atrás', 'Esta semana'];
  return order.filter(l => groups[l]).map(l => ({ label: l, items: groups[l] }));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifs, setNotifs]   = useState<InboxNotif[]>([]);
  const [toast, setToast]     = useState<string | false>(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2000); };

  useEffect(() => {
    seedIfEmpty();
    setNotifs(notifInboxStore.get());
  }, []);

  const markAll = () => {
    notifInboxStore.markAllRead();
    setNotifs(notifInboxStore.get());
    showToast('Tudo marcado como lido');
  };

  const markOne = (id: string) => {
    notifInboxStore.markRead(id);
    setNotifs(notifInboxStore.get());
  };

  const unread = notifs.filter(n => !n.read).length;
  const groups = groupByDay(notifs);

  return (
    <Frame>
      <Screen>
        <GlassHeader
          left={
            <button onClick={() => router.back()}
              style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
              <Icon name="chevronL" size={16} color="#fff" />
            </button>
          }
          right={
            unread > 0 ? (
              <button onClick={markAll}
                style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', cursor: 'pointer' }}>
                <Txt size={11} weight={700} color="rgba(255,255,255,0.85)">Marcar tudo</Txt>
              </button>
            ) : undefined
          }
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'Area',sans-serif" }}>Notificações</div>
            {unread > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: "'Area',sans-serif", marginTop: 1 }}>{unread} não lida{unread !== 1 ? 's' : ''}</div>
            )}
          </div>
        </GlassHeader>

        <ScrollArea>
          <div style={{ padding: '12px 16px 0' }}>

            {/* Empty state */}
            {notifs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '72px 24px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bell" size={28} color={T.t4} />
                </div>
                <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>Sem notificações</Txt>
                <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>
                  Quando você receber notificações, elas aparecerão aqui. Notificações são removidas automaticamente após 7 dias.
                </Txt>
              </div>
            )}

            {/* Grouped notifications */}
            {groups.map(group => (
              <div key={group.label} style={{ marginBottom: 24 }}>
                <Txt size={11} weight={700} color={T.t4} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                  {group.label}
                </Txt>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map(n => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      onRead={() => markOne(n.id)}
                      onNav={() => {
                        markOne(n.id);
                        if (n.link) router.push(n.link);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Footer note */}
            {notifs.length > 0 && (
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <Txt size={11} color={T.t4} style={{ display: 'block', lineHeight: 1.5 }}>
                  Notificações são removidas automaticamente após 7 dias
                </Txt>
              </div>
            )}
          </div>
          <div style={{ height: 100 }} />
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} />
      </Screen>
    </Frame>
  );
}

/* ── Single notification card ── */
function NotifCard({ notif, onRead, onNav }: {
  notif: InboxNotif;
  onRead: () => void;
  onNav: () => void;
}) {
  const icon  = TYPE_ICON[notif.type]  || 'bell';
  const color = TYPE_COLOR[notif.type] || T.t3;
  const isUnread = !notif.read;

  return (
    <div
      onClick={onNav}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '14px 14px',
        borderRadius: 16,
        background: isUnread ? `${color}14` : T.card,
        border: `1px solid ${isUnread ? `${color}30` : T.border}`,
        cursor: notif.link ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {/* Icon circle */}
      <div style={{
        width: 40, height: 40, borderRadius: 20, flexShrink: 0,
        background: `${color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={18} color={color} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          <Txt size={13} weight={isUnread ? 700 : 600} color={T.t1} style={{ display: 'block', lineHeight: 1.4 }}>
            {notif.title}
          </Txt>
          <Txt size={10} color={T.t4} style={{ flexShrink: 0, marginTop: 2 }}>{timeAgo(notif.time)}</Txt>
        </div>
        <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 4, lineHeight: 1.5 }}>
          {notif.body}
        </Txt>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          width: 7, height: 7, borderRadius: 4,
          background: color,
        }} />
      )}
    </div>
  );
}
