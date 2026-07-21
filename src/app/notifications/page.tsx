'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, GlassHeader, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { notifInboxStore, prefsStore, profileStore, isNotifEnabled, syncProReminderNotifications, type InboxNotif, type NotifPrefKey } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { navigateBack, navigateTo } from '@/lib/navigation';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbAppNotifStore, dbNotifStore, dbProSettingsStore, type NotifDoc, type NotificationPageCursor } from '@/lib/db';

type ActiveTab = 'account' | 'app';

/* ── Avatar gradient derivation ── */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#C069FF,#7B2FBE)',
  'linear-gradient(135deg,#60A5FA,#2563EB)',
  'linear-gradient(135deg,#F472B6,#DB2777)',
  'linear-gradient(135deg,#34D399,#059669)',
  'linear-gradient(135deg,#FBBF24,#D97706)',
  'linear-gradient(135deg,#F87171,#DC2626)',
];
function letterGradient(letter: string) {
  const code = ((letter || 'A').toUpperCase().charCodeAt(0) - 65 + AVATAR_GRADIENTS.length) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[code];
}

/* ── "Do app" icon/color map ── */
const APP_ICON: Record<InboxNotif['type'], string> = {
  new_episode: 'play', like: 'heart', reply: 'message',
  follow: 'user', release: 'star', pro_reminder: 'bell', general: 'bell',
};
const APP_COLOR: Record<InboxNotif['type'], string> = {
  new_episode: '#60a5fa', like: T.pink, reply: '#a78bfa',
  follow: '#4ade80', release: T.gold, pro_reminder: T.pink, general: T.t3,
};

/* ── Group by day key (translation-friendly) ── */
type DayKey = 'today' | 'yesterday' | `day_${number}` | 'thisWeek';

function groupByDay<T extends { _ts: string }>(items: T[]): Array<{ key: DayKey; items: T[] }> {
  const groups: Record<string, T[]> = {};
  const keys: Record<string, DayKey> = {};
  const now = new Date();
  for (const n of items) {
    const diffDays = Math.floor((now.getTime() - new Date(n._ts).getTime()) / 86400000);
    let bucket: string;
    let key: DayKey;
    if (diffDays === 0)      { bucket = 'today';     key = 'today'; }
    else if (diffDays === 1) { bucket = 'yesterday'; key = 'yesterday'; }
    else if (diffDays < 7)   { bucket = `day_${diffDays}`; key = `day_${diffDays}`; }
    else                     { bucket = 'thisWeek';  key = 'thisWeek'; }
    if (!groups[bucket]) { groups[bucket] = []; keys[bucket] = key; }
    groups[bucket].push(n);
  }
  const order = ['today','yesterday','day_2','day_3','day_4','day_5','day_6','thisWeek'];
  return order.filter(b => groups[b]).map(b => ({ key: keys[b], items: groups[b] }));
}

/* ── Compact time ── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return '–';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ═══════════════════════════════════════════════════════════ */

export default function NotificationsPage() {
  const router             = useRouter();
  const { t }              = useTranslation('notifications');
  const { user, loading }  = useAuth();
  const uid                = user?.uid ?? null;

  const [tab, setTab]             = useState<ActiveTab>('account');
  const [toast, setToast]         = useState<string | false>(false);
  const [clearing, setClearing]   = useState(false);

  // "Minha conta" state
  const [accountNotifs, setAccountNotifs] = useState<(NotifDoc & { docId: string })[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountLoaded, setAccountLoaded]   = useState(false);
  const [accountCursor, setAccountCursor] = useState<NotificationPageCursor | null>(null);
  const [accountHasMore, setAccountHasMore] = useState(false);

  // "Do app" state
  const [appNotifs, setAppNotifs] = useState<InboxNotif[]>([]);
  const [appCursor, setAppCursor] = useState<NotificationPageCursor | null>(null);
  const [appHasMore, setAppHasMore] = useState(false);
  const [appLoading, setAppLoading] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(false), 2200); };

  /* ── Load verified app notifications (cloud + local reminders) ── */
  useEffect(() => {
    if (loading) return;
    if (!uid) { setAppNotifs([]); return; }
    let cancelled = false;

    // Older builds generated sample release/episode alerts. Remove them once
    // so only notifications backed by a real event remain visible.
    const local = notifInboxStore.get(uid);
    const verifiedLocal = local.filter((item) => !item.id.startsWith('seed_'));
    if (verifiedLocal.length !== local.length) {
      notifInboxStore.clear(uid);
      verifiedLocal.forEach((item) => notifInboxStore.add(item, uid));
    }

    const reminderSettings = profileStore.get(uid).proMember === true
      ? syncProReminderNotifications(uid)
      : null;
    if (reminderSettings && firebaseConfigured) {
      dbProSettingsStore.set(getDB(), uid, reminderSettings).catch(() => {});
    }
    const localAfterReminders = notifInboxStore.get(uid);
    if (!firebaseConfigured) {
      setAppNotifs(localAfterReminders);
      return;
    }
    setAppLoading(true);
    dbAppNotifStore.listPage(getDB(), uid).then((page) => {
      if (cancelled) return;
      const merged = new Map<string, InboxNotif>();
      [...page.items, ...localAfterReminders].forEach((item) => {
        if (!merged.has(item.id)) merged.set(item.id, item);
      });
      setAppCursor(page.cursor);
      setAppHasMore(page.hasMore);
      setAppNotifs(Array.from(merged.values()).sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      ));
    }).catch(() => {
      if (!cancelled) setAppNotifs(localAfterReminders);
    }).finally(() => { if (!cancelled) setAppLoading(false); });
    return () => { cancelled = true; };
  }, [uid, loading]);

  // Account notifications are Firestore-backed React state, so they must be
  // dropped immediately when the authenticated account changes.
  useEffect(() => {
    setAccountNotifs([]);
    setAccountLoading(false);
    setAccountLoaded(false);
    setAccountCursor(null);
    setAccountHasMore(false);
    setAppCursor(null);
    setAppHasMore(false);
  }, [uid]);

  /* ── Load "Minha conta" (Firestore) once per session ── */
  useEffect(() => {
    if (loading || !uid || accountLoaded) return;
    if (!firebaseConfigured) { setAccountLoaded(true); return; }
    let cancelled = false;
    setAccountLoading(true);
    dbNotifStore.listPage(getDB(), uid).then(page => {
      if (cancelled) return;
      setAccountNotifs(page.items);
      setAccountCursor(page.cursor);
      setAccountHasMore(page.hasMore);
      setAccountLoading(false);
      setAccountLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setAccountLoading(false);
      setAccountLoaded(true);
    });
    return () => { cancelled = true; };
  }, [uid, loading, accountLoaded]);

  const loadMoreAccount = async () => {
    if (!uid || !accountCursor || !accountHasMore || accountLoading) return;
    setAccountLoading(true);
    try {
      const page = await dbNotifStore.listPage(getDB(), uid, accountCursor);
      setAccountNotifs((current) => [...current, ...page.items]);
      setAccountCursor(page.cursor);
      setAccountHasMore(page.hasMore);
    } finally { setAccountLoading(false); }
  };

  const loadMoreApp = async () => {
    if (!uid || !appCursor || !appHasMore || appLoading) return;
    setAppLoading(true);
    try {
      const page = await dbAppNotifStore.listPage(getDB(), uid, appCursor);
      setAppNotifs((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => b.time.localeCompare(a.time));
      });
      setAppCursor(page.cursor);
      setAppHasMore(page.hasMore);
    } finally { setAppLoading(false); }
  };

  /* ── Mark all read ── */
  const markAllRead = async () => {
    if (tab === 'app') {
      notifInboxStore.markAllRead(uid);
      if (firebaseConfigured && uid) await dbAppNotifStore.markAllRead(getDB(), uid).catch(() => {});
      setAppNotifs(prev => prev.map(n => ({ ...n, read: true })));
    } else {
      if (firebaseConfigured && uid) {
        await dbNotifStore.markAllRead(getDB(), uid);
        setAccountNotifs(prev => prev.map(n => ({ ...n, read: true })));
      }
    }
    showToast(t('allRead'));
  };

  /* ── Permanently clear the active inbox ── */
  const clearNotifications = async () => {
    if (clearing || !window.confirm(t('clearConfirm'))) return;
    setClearing(true);
    try {
      if (tab === 'account') {
        if (firebaseConfigured && uid) await dbNotifStore.clearAll(getDB(), uid);
        setAccountNotifs([]);
        setAccountCursor(null);
        setAccountHasMore(false);
      } else {
        if (firebaseConfigured && uid) await dbAppNotifStore.clearAll(getDB(), uid);
        notifInboxStore.clear(uid);
        setAppNotifs([]);
        setAppCursor(null);
        setAppHasMore(false);
      }
      showToast(t('cleared'));
    } catch {
      showToast(t('clearError'));
    } finally {
      setClearing(false);
    }
  };

  /* ── Mark one read ── */
  const markOne = (id: string) => {
    notifInboxStore.markRead(id, uid);
    const current = appNotifs.find(item => item.id === id);
    if (firebaseConfigured && current?.cloudId) {
      dbAppNotifStore.markRead(getDB(), current.cloudId).catch(() => {});
    }
    setAppNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };
  const markOneAccount = (docId: string) => {
    if (firebaseConfigured) dbNotifStore.markRead(getDB(), docId).catch(() => {});
    setAccountNotifs(prev => prev.map(n => n.docId === docId ? { ...n, read: true } : n));
  };

  /* ── Unread counts ── */
  /* ── Notification preferences: hide disabled categories ──
     'general' app notices always show; unknown types default to visible. */
  const [prefs] = useState(() => prefsStore.get());
  const ACCOUNT_PREF: Record<NotifDoc['type'], NotifPrefKey> = {
    comment_like: 'likes', comment_reply: 'replies', new_follower: 'followers',
  };
  const APP_PREF: Partial<Record<InboxNotif['type'], NotifPrefKey>> = {
    like: 'likes', reply: 'replies', follow: 'followers',
    release: 'premieres', new_episode: 'episodes', pro_reminder: 'reminders',
  };
  const visibleAccount = accountNotifs.filter(n => {
    const key = ACCOUNT_PREF[n.type];
    return !key || isNotifEnabled(prefs, key);
  });
  const visibleApp = appNotifs.filter(n => {
    const key = APP_PREF[n.type];
    return !key || isNotifEnabled(prefs, key);
  });

  const accountUnread = visibleAccount.filter(n => !n.read).length;
  const appUnread     = visibleApp.filter(n => !n.read).length;
  const currentUnread = tab === 'account' ? accountUnread : appUnread;
  const currentCount = tab === 'account' ? accountNotifs.length : appNotifs.length;

  /* ── Grouped lists ── */
  const accountGrouped = groupByDay(visibleAccount.map(n => ({ ...n, _ts: n.createdAt })));
  const appGrouped     = groupByDay(visibleApp.map(n => ({ ...n, _ts: n.time })));

  return (
    <Frame>
      <Screen>
        <GlassHeader
          left={
            <button onClick={() => navigateBack(router)}
              style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as React.CSSProperties}>
              <Icon name="chevronL" size={16} color="#fff" />
            </button>
          }
          right={
            currentUnread > 0 ? (
              <button onClick={markAllRead}
                style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', cursor: 'pointer' }}>
                <Txt size={11} weight={700} color="rgba(255,255,255,0.85)">{t('markAll')}</Txt>
              </button>
            ) : undefined
          }
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'Area',sans-serif" }}>{t('title')}</div>
          </div>
        </GlassHeader>

        {/* ── Tab selector ── */}
        <div style={{ flexShrink: 0, padding: '0 16px', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'account', label: t('tabs.account'), count: accountUnread },
              { key: 'app',     label: t('tabs.app'),     count: appUnread     },
            ] as { key: ActiveTab; label: string; count: number }[]).map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <button key={key} onClick={() => setTab(key)} style={{
                  flex: 1, padding: '10px 4px', background: active ? '#fff' : 'transparent', border: 'none',
                  borderRadius: 20,
                  cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Txt size={13} weight={active ? 700 : 500} color={active ? T.active : T.t3}>{label}</Txt>
                    {count > 0 && (
                      <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: '#C069FF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                        <Txt size={10} weight={700} color="#fff">{count > 99 ? '99+' : count}</Txt>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <ScrollArea>
          {currentCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px 0' }}>
              <button
                type="button"
                onClick={clearNotifications}
                disabled={clearing}
                aria-label={t('clear')}
                style={{
                  padding: '7px 11px', borderRadius: 18,
                  background: 'rgba(255,90,95,0.10)',
                  border: '1px solid rgba(255,90,95,0.18)',
                  color: '#FF7378', cursor: clearing ? 'default' : 'pointer',
                  fontSize: 11, fontWeight: 700,
                  fontFamily: "'Area','Inter',sans-serif",
                  opacity: clearing ? 0.55 : 1,
                }}
              >
                {clearing ? t('clearing') : t('clear')}
              </button>
            </div>
          )}
          <div style={{ padding: '16px 16px 0' }}>

            {/* ══ MINHA CONTA tab ══ */}
            {tab === 'account' && (
              <>
                {accountLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} style={{ height: 72, borderRadius: 16, background: T.card, border: `1px solid ${T.border}`, opacity: 0.6 + i * 0.1 }} />
                    ))}
                  </div>
                )}

                {!accountLoading && visibleAccount.length === 0 && (
                  <EmptyState
                    icon="user"
                    title={t('empty.account.title')}
                    body={t('empty.account.body')}
                  />
                )}

                {!accountLoading && accountGrouped.map(group => (
                  <DayGroup key={group.key} dayKey={group.key} count={group.items.length}>
                    {group.items.map(n => (
                      <AccountCard
                        key={n.docId}
                        notif={n}
                        onTap={() => {
                          markOneAccount(n.docId);
                          if (n.link) navigateTo(router, n.link);
                        }}
                      />
                    ))}
                  </DayGroup>
                ))}
                {accountHasMore && <LoadMoreButton loading={accountLoading} onClick={loadMoreAccount} />}
              </>
            )}

            {/* ══ DO APP tab ══ */}
            {tab === 'app' && (
              <>
                {visibleApp.length === 0 && (
                  <EmptyState
                    icon="bell"
                    title={t('empty.app.title')}
                    body={t('empty.app.body')}
                  />
                )}

                {appGrouped.map(group => (
                  <DayGroup key={group.key} dayKey={group.key} count={group.items.length}>
                    {group.items.map(n => (
                      <AppCard
                        key={n.id}
                        notif={n}
                        onTap={() => {
                          markOne(n.id);
                          if (n.link) navigateTo(router, n.link);
                        }}
                      />
                    ))}
                  </DayGroup>
                ))}
                {appHasMore && <LoadMoreButton loading={appLoading} onClick={loadMoreApp} />}

                {visibleApp.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                    <Txt size={11} color={T.t4} style={{ display: 'block', lineHeight: 1.5 }}>
                      {t('footer')}
                    </Txt>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ height: 32 }} />
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} />
      </Screen>
    </Frame>
  );
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} style={{ display: 'block', margin: '8px auto 18px', padding: '10px 20px', borderRadius: 22, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
      {loading ? 'Carregando…' : 'Carregar mais'}
    </button>
  );
}

/* ── Day group wrapper ── */
function DayGroup({ dayKey, count, children }: { dayKey: DayKey; count: number; children: React.ReactNode }) {
  const { t } = useTranslation('notifications');
  let label: string;
  if (dayKey === 'today')     label = t('groups.today');
  else if (dayKey === 'yesterday') label = t('groups.yesterday');
  else if (dayKey === 'thisWeek')  label = t('groups.thisWeek');
  else {
    const n = parseInt(dayKey.replace('day_', ''), 10);
    label = t('groups.daysAgo', { count: n });
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <Txt size={11} weight={700} color={T.t2} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        {label}
      </Txt>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '72px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 32, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={28} color={T.t4} />
      </div>
      <Txt size={16} weight={700} color={T.t1} style={{ display: 'block' }}>{title}</Txt>
      <Txt size={13} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>{body}</Txt>
    </div>
  );
}

/* ── "Minha conta" notification card ── */
function AccountCard({ notif, onTap }: { notif: NotifDoc & { docId: string }; onTap: () => void }) {
  const { t } = useTranslation('notifications');
  const typeKey = notif.type === 'new_follower' ? 'newFollower' : notif.type === 'comment_reply' ? 'commentReply' : 'commentLike';
  const main = t(`types.${typeKey}`, { username: notif.actorUsername });
  const sub  = (notif.type === 'comment_reply' || notif.type === 'comment_like') ? notif.titleName : undefined;
  const isUnread = !notif.read;
  const accentColor = '#C069FF';

  return (
    <div onClick={onTap} style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '14px 14px',
      borderRadius: 16,
      background: isUnread ? `${accentColor}12` : T.card,
      border: `1px solid ${isUnread ? `${accentColor}28` : T.border}`,
      cursor: 'pointer',
      position: 'relative',
    }}>
      {/* Avatar */}
      <div style={{ flexShrink: 0 }}>
        {notif.actorAvatarImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={notif.actorAvatarImage}
            alt={notif.actorName}
            style={{ width: 44, height: 44, borderRadius: 22, objectFit: 'cover', border: `2px solid ${T.border}` }}
          />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: 22,
            background: letterGradient(notif.actorAvatarLetter),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Txt size={17} weight={700} color="#fff">{notif.actorAvatarLetter}</Txt>
          </div>
        )}
        {/* Type badge */}
        <div style={{
          position: 'absolute', left: 42, top: 42,
          width: 20, height: 20, borderRadius: 10,
          background: T.card, border: `1.5px solid ${T.bg}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon
            name={notif.type === 'new_follower' ? 'user' : notif.type === 'comment_reply' ? 'message' : 'heart'}
            size={10}
            color={accentColor}
          />
        </div>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <Txt size={13} weight={isUnread ? 700 : 500} color={T.t1} style={{ display: 'block', lineHeight: 1.4 }}>
          {main}
        </Txt>
        {sub && (
          <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 2 }}>
            {sub}
          </Txt>
        )}
        <Txt size={10} color={T.t4} style={{ display: 'block', marginTop: 4 }}>
          {timeAgo(notif.createdAt)}
        </Txt>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div style={{ position: 'absolute', top: 14, right: 14, width: 7, height: 7, borderRadius: 4, background: accentColor }} />
      )}
    </div>
  );
}

/* ── "Do app" notification card ── */
function AppCard({ notif, onTap }: { notif: InboxNotif; onTap: () => void }) {
  const icon  = APP_ICON[notif.type]  || 'bell';
  const color = APP_COLOR[notif.type] || T.t3;
  const isUnread = !notif.read;

  return (
    <div onClick={onTap} style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '14px 14px',
      borderRadius: 16,
      background: isUnread ? `${color}14` : T.card,
      border: `1px solid ${isUnread ? `${color}30` : T.border}`,
      cursor: notif.link ? 'pointer' : 'default',
      position: 'relative',
    }}>
      {/* Poster (if available) or icon circle */}
      {notif.poster ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={notif.poster}
          alt=""
          style={{ width: 44, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: `1px solid ${T.border}` }}
        />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 22, flexShrink: 0,
          background: `${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={18} color={color} />
        </div>
      )}

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
        <div style={{ position: 'absolute', top: 14, right: 14, width: 7, height: 7, borderRadius: 4, background: color }} />
      )}
    </div>
  );
}
