'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, Txt, GlassHeader } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T, type IconName } from '@/lib/tokens';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { profileStore, type Profile } from '@/lib/store';
import { withProfileOrigin } from '@/lib/navigation';
import { AI_CURATION_ENABLED, PRO_SELF_SERVICE_ENABLED } from '@/lib/features';

const COMMUNITY_URL = 'https://community.maratonou.com';

/* ── iOS-style switch (accent = app purple) ──
   Purely visual: the whole row is the interactive element (a nested
   button-in-button is invalid HTML and breaks hydration). */
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

type Row = {
  icon: IconName;
  label: string;
  sub?: string;
  onClick?: () => void;
  /** default 'chevron'; pass a node (e.g. <Switch/>) or null for none */
  right?: ReactNode;
  danger?: boolean;
};

/* ── grouped rounded card of rows, reference style (no section titles) ── */
const Group = ({ rows }: { rows: Row[] }) => (
  <div style={{ background: T.card, borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 14 }}>
    {rows.map((row, i) => (
      <button
        key={row.label}
        onClick={row.onClick}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '15px 16px', background: 'none', border: 'none',
          borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none',
          cursor: row.onClick ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <Icon name={row.icon} size={19} color={row.danger ? '#FF5A5F' : T.t2} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={14} weight={600} color={row.danger ? '#FF5A5F' : T.t1} style={{ display: 'block' }}>{row.label}</Txt>
          {row.sub && <Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 1 }}>{row.sub}</Txt>}
        </div>
        {row.right === undefined
          ? <Icon name="chevronR" size={16} color={T.t3} />
          : row.right}
      </button>
    ))}
  </div>
);

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const isDark = theme === 'dark';

  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    const load = () => { try { setProfile(profileStore.get(user?.uid)); } catch {} };
    load();
    window.addEventListener('maratonou:sync', load);
    return () => window.removeEventListener('maratonou:sync', load);
  }, [user?.uid]);

  // Visual prototype only. Production billing authorization must replace
  // this profile marker with a server-controlled entitlement.
  const isPro = profile?.proMember === true;

  const displayName = profile?.name || user?.displayName || t('title');
  const username    = profile?.username ? `@${profile.username}` : '';
  const avatarImg   = profile?.avatarImage || user?.photoURL || '';
  const avatarLetter = (profile?.avatarLetter || displayName[0] || '?').toUpperCase();

  const [showNavTitle, setShowNavTitle] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowNavTitle(!entry.isIntersecting),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>

          {/* ── Header glass sticky ── */}
          <GlassHeader
            navTitle={t('title')}
            showNavTitle={showNavTitle}
            right={
              <button onClick={() => router.push(withProfileOrigin('/notifications'))} style={{ width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={16} color="#fff" />
              </button>
            }
          />

          {/* ── Content ── */}
          <div style={{ minHeight: 500, padding: '0 16px 32px' }}>

            {/* Título */}
            <div ref={titleRef}>
              <Txt size={22} weight={900} color={T.t1} style={{ display: 'block', paddingTop: 16, marginBottom: 20, letterSpacing: '-0.5px' }}>
                {t('title')}
              </Txt>
            </div>

            {/* ══ Card de perfil (referência: avatar + nome + @user + chevron) ══ */}
            <div
              onClick={() => router.push(withProfileOrigin('/settings/edit-profile'))}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: T.card, borderRadius: 20, padding: '14px 16px',
                cursor: 'pointer', marginBottom: 14,
                boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 26, flexShrink: 0, overflow: 'hidden',
                background: avatarImg ? `url(${avatarImg}) center/cover no-repeat` : (profile?.avatarGradient || 'linear-gradient(135deg, #7B2FBE 0%, #C069FF 100%)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!avatarImg && <Txt size={20} weight={900} color="#fff">{avatarLetter}</Txt>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Txt size={16} weight={800} color={T.t1} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</Txt>
                {username && <Txt size={12} color={T.t3} style={{ display: 'block', marginTop: 2 }}>{username}</Txt>}
              </div>
              <Icon name="chevronR" size={17} color={T.t3} />
            </div>

            {/* ══ Banner PRO ══ */}
            {!isPro ? (PRO_SELF_SERVICE_ENABLED ? (
              <div
                onClick={() => router.push(withProfileOrigin('/pro'))}
                style={{
                  marginBottom: 14, borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #f5c518 0%, #e0a800 60%, #c47d00 100%)',
                  boxShadow: '0 4px 20px rgba(245,197,24,0.35)',
                  padding: '18px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="crown" size={24} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <Txt size={15} weight={900} color="#fff" style={{ display: 'block', marginBottom: 2 }}>{t('vip.bannerTitle')}</Txt>
                  <Txt size={12} color="rgba(255,255,255,0.85)">{t('vip.bannerSub')}</Txt>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '7px 14px', flexShrink: 0 }}>
                  <Txt size={12} weight={800} color="#fff">{t('vip.subscribe')}</Txt>
                </div>
              </div>
            ) : null) : (
              <div
                onClick={() => router.push(withProfileOrigin('/settings/pro'))}
                style={{
                  marginBottom: 14, borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7B2FBE 0%, #C069FF 100%)',
                  boxShadow: '0 4px 20px rgba(192,105,255,0.35)',
                  padding: '18px 18px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="crown" size={24} color={T.gold} />
                </div>
                <div style={{ flex: 1 }}>
                  <Txt size={15} weight={900} color="#fff" style={{ display: 'block', marginBottom: 2 }}>{t('vip.activePlan')}</Txt>
                  <Txt size={12} color="rgba(255,255,255,0.8)">{t('vip.renewalSub')}</Txt>
                </div>
                <Icon name="chevronR" size={18} color="rgba(255,255,255,0.7)" />
              </div>
            )}

            {isPro && (
              <Group rows={[
                { icon: 'crown', label: t('proSettings.settingsLabel'), sub: t('proSettings.settingsSub'), onClick: () => router.push(withProfileOrigin('/settings/pro')) },
              ]} />
            )}

            {/* ══ Conta ══ */}
            <Group rows={[
              { icon: 'lock', label: t('items.changePassword'), onClick: () => router.push(withProfileOrigin('/settings/change-password')) },
              { icon: 'bell', label: t('items.notifications'),  onClick: () => router.push(withProfileOrigin('/notifications')) },
              { icon: 'settings', label: t('items.notifPrefs'), sub: t('items.notifPrefsSub'), onClick: () => router.push(withProfileOrigin('/settings/notifications')) },
            ]} />

            {/* ══ Conteúdo & preferências ══ */}
            <Group rows={[
              ...(AI_CURATION_ENABLED ? [{ icon: 'star' as IconName, label: t('vip.aiCuration'), onClick: () => router.push(withProfileOrigin('/curadoria')) }] : []),
              { icon: 'chart', label: t('vip.accountStats'),  onClick: () => router.push(withProfileOrigin('/stats')) },
              { icon: 'wifi',  label: t('items.streamings'),  onClick: () => router.push(withProfileOrigin('/settings/streamings')) },
              { icon: 'heart', label: t('items.genres'),      onClick: () => router.push(withProfileOrigin('/settings/genres')) },
              { icon: 'play',  label: t('items.expenses'),    onClick: () => router.push(withProfileOrigin('/expenses')) },
            ]} />

            {/* ══ Aparência, idioma e dados ══ */}
            <Group rows={[
              {
                icon: 'moon',
                label: t('theme.darkMode'),
                onClick: () => setTheme(isDark ? 'light' : 'dark'),
                right: <Switch on={isDark} />,
              },
              { icon: 'flag', label: t('items.language'),   onClick: () => router.push(withProfileOrigin('/settings/language')) },
              { icon: 'tv',   label: t('items.importData'), sub: t('items.importDataSub'), onClick: () => router.push(withProfileOrigin('/settings/import')) },
            ]} />

            {/* ══ Geral ══ */}
            <Group rows={[
              { icon: 'message', label: t('items.support'), onClick: () => window.location.assign(COMMUNITY_URL) },
              { icon: 'info',  label: t('items.about'), sub: t('items.iconsCredit'), right: null },
              { icon: 'share', label: t('items.rate'),  onClick: () => {} },
            ]} />

            {/* ══ Conta e sessão ══ */}
            <Group rows={[
              { icon: 'trash', label: t('items.deleteAccount'), onClick: () => router.push(withProfileOrigin('/settings/delete-account')), danger: true },
              { icon: 'logout', label: t('items.logout'), onClick: signOut, danger: true, right: null },
            ]} />

            {/* ══ Atribuição TMDB (exigida pelos termos da API) ══ */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 24px 6px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tmdb.svg" alt="TMDB" style={{ height: 13, width: 'auto', display: 'block' }} />
              <Txt size={11} color={T.t3} style={{ display: 'block', textAlign: 'center', lineHeight: 1.5 }}>
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </Txt>
            </div>
          </div>
        </div>
      </Screen>
    </Frame>
  );
}
