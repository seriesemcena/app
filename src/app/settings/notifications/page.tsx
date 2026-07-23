'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader } from '@/components/SettingsLayout';
import { T, type IconName } from '@/lib/tokens';
import { navigateBack } from '@/lib/navigation';
import { prefsStore, isNotifEnabled, type NotifPrefKey, type Prefs } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbPrefsStore } from '@/lib/db';
import type { PushPermissionState } from '@/lib/fcm';

/* ── iOS-style switch, visual only (the row is the interactive element) ── */
const Switch = ({ on }: { on: boolean }) => (
  <span
    role="switch"
    aria-checked={on}
    style={{
      width: 48, height: 29, borderRadius: 15, flexShrink: 0,
      position: 'relative', display: 'inline-block',
      background: on ? T.pink : T.surface2,
      transition: 'background 0.22s ease',
    }}
  >
    <span style={{
      position: 'absolute', top: 3, left: on ? 22 : 3,
      width: 23, height: 23, borderRadius: 12, background: '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.30)',
      transition: 'left 0.22s cubic-bezier(0.34, 1.4, 0.64, 1)',
    }} />
  </span>
);

type PrefRow = { key: NotifPrefKey; icon: IconName; labelKey: string; subKey: string };

const ACTIVITY_ROWS: PrefRow[] = [
  { key: 'mentions',  icon: 'message', labelKey: 'notifPrefs.mentions',  subKey: 'notifPrefs.mentionsSub' },
  { key: 'likes',     icon: 'heart',   labelKey: 'notifPrefs.likes',     subKey: 'notifPrefs.likesSub' },
  { key: 'replies',   icon: 'smile',   labelKey: 'notifPrefs.replies',   subKey: 'notifPrefs.repliesSub' },
  { key: 'followers', icon: 'user',    labelKey: 'notifPrefs.followers', subKey: 'notifPrefs.followersSub' },
];

const CONTENT_ROWS: PrefRow[] = [
  { key: 'premieres', icon: 'star', labelKey: 'notifPrefs.premieres', subKey: 'notifPrefs.premieresSub' },
  { key: 'episodes',  icon: 'play', labelKey: 'notifPrefs.episodes',  subKey: 'notifPrefs.episodesSub' },
  { key: 'reminders', icon: 'bell', labelKey: 'notifPrefs.reminders', subKey: 'notifPrefs.remindersSub' },
];

export default function NotificationPrefsPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const { user } = useAuth();

  const [prefs, setPrefs] = useState<Prefs>({});
  const [permission, setPermission] = useState<PushPermissionState>('default');
  useEffect(() => {
    setPrefs(prefsStore.get());
    import('@/lib/fcm')
      .then(({ getPushPermissionState }) => getPushPermissionState())
      .then(setPermission)
      .catch(() => {});
  }, []);

  const enablePush = async () => {
    const { initFCM, requestPushPermission } = await import('@/lib/fcm');
    const next = await requestPushPermission();
    setPermission(next);
    if (next === 'granted' && user && firebaseConfigured) {
      await initFCM(getDB(), user.uid);
    }
  };

  const toggle = (key: NotifPrefKey) => {
    const next: Prefs = {
      ...prefs,
      notifPrefs: { ...prefs.notifPrefs, [key]: !isNotifEnabled(prefs, key) },
    };
    setPrefs(next);
    prefsStore.set(next);
    if (user && firebaseConfigured) {
      dbPrefsStore.set(getDB(), user.uid, next).catch(() => {});
    }
  };

  const Rows = ({ rows }: { rows: PrefRow[] }) => (
    <SettingsCard style={{ marginBottom: 14 }}>
      {rows.map((row, i) => {
        const on = isNotifEnabled(prefs, row.key);
        return (
          <button
            key={row.key}
            onClick={() => toggle(row.key)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', background: 'none', border: 'none',
              borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Icon name={row.icon} size={19} color={T.t2} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Txt size={14} weight={600} color={T.t1} style={{ display: 'block' }}>{t(row.labelKey)}</Txt>
              <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 1 }}>{t(row.subKey)}</Txt>
            </div>
            <Switch on={on} />
          </button>
        );
      })}
    </SettingsCard>
  );

  return (
    <Frame>
      <Screen>
        <SettingsHeader title={t('notifPrefs.title')} onBack={() => navigateBack(router)} />
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', padding: '4px 16px calc(var(--tab-h, 90px) + 16px)' } as React.CSSProperties}>

          <Txt size={12} color={T.t3} style={{ display: 'block', margin: '4px 4px 16px', lineHeight: 1.5 }}>
            {t('notifPrefs.intro')}
          </Txt>

          <SettingsCard style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
              <Icon name="bell" size={19} color={permission === 'granted' ? T.pink : T.t2} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight={600} color={T.t1} style={{ display: 'block' }}>{t('notifPrefs.pushTitle')}</Txt>
                <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 1 }}>
                  {permission === 'granted'
                    ? t('notifPrefs.pushEnabled')
                    : permission === 'denied'
                      ? t('notifPrefs.pushBlocked')
                      : t('notifPrefs.pushDisabled')}
                </Txt>
              </div>
              {permission !== 'granted' && (
                <button
                  onClick={enablePush}
                  disabled={permission === 'denied'}
                  style={{ border: 'none', borderRadius: 16, padding: '8px 12px', background: permission === 'denied' ? T.surface2 : T.pink, color: permission === 'denied' ? T.t3 : '#fff', fontSize: 12, fontWeight: 700, cursor: permission === 'denied' ? 'default' : 'pointer' }}
                >
                  {t('notifPrefs.enablePush')}
                </button>
              )}
            </div>
          </SettingsCard>

          {/* ── Atividade da conta ── */}
          <Txt size={11} weight={700} color={T.t2} style={{ display: 'block', margin: '0 4px 8px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('notifPrefs.activitySection')}
          </Txt>
          <Rows rows={ACTIVITY_ROWS} />

          {/* ── Conteúdo ── */}
          <Txt size={11} weight={700} color={T.t2} style={{ display: 'block', margin: '6px 4px 8px', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('notifPrefs.contentSection')}
          </Txt>
          <Rows rows={CONTENT_ROWS} />
        </div>
      </Screen>
    </Frame>
  );
}
