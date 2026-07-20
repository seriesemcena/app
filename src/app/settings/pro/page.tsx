'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader, SettingsPrimaryButton } from '@/components/SettingsLayout';
import { T } from '@/lib/tokens';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProSettingsStore, dbProfileStore } from '@/lib/db';
import {
  DEFAULT_PRO_THEME,
  PRO_HOME_SECTION_KEYS,
  listStore,
  profileStore,
  proSettingsStore,
  syncProReminderNotifications,
  type ProHomeSectionKey,
  type ProProfileTheme,
  type ProReminder,
  type ProSettings,
  type Profile,
} from '@/lib/store';
import { tmdbImg } from '@/lib/tmdb';
import { navigateBack } from '@/lib/navigation';

const MAX_INPUT = 15 * 1024 * 1024;
const PALETTES = [
  { accent: '#C069FF', gradient: 'linear-gradient(145deg,#421c61 0%,#171020 58%,#09090d 100%)' },
  { accent: '#E45835', gradient: 'linear-gradient(145deg,#632416 0%,#24100d 58%,#09090d 100%)' },
  { accent: '#56C4A8', gradient: 'linear-gradient(145deg,#174b43 0%,#102320 58%,#09090d 100%)' },
  { accent: '#E8B34B', gradient: 'linear-gradient(145deg,#5b4313 0%,#241d0d 58%,#09090d 100%)' },
  { accent: '#639BFF', gradient: 'linear-gradient(145deg,#183761 0%,#101b2c 58%,#09090d 100%)' },
];

const HOME_LABELS: Record<ProHomeSectionKey, { icon: 'star' | 'tv' | 'play' | 'film' | 'wifi' | 'info'; key: string }> = {
  hero: { icon: 'star', key: 'hero' },
  watching: { icon: 'tv', key: 'watching' },
  recommendedSeries: { icon: 'play', key: 'recommendedSeries' },
  recommendedMovies: { icon: 'film', key: 'recommendedMovies' },
  streamings: { icon: 'wifi', key: 'streamings' },
  news: { icon: 'info', key: 'news' },
};

function compressCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_INPUT) { reject(new Error('Arquivo muito grande (máx. 15 MB)')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1120 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Não foi possível processar a imagem')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.7, 0.58, 0.48, 0.4]) {
        const output = canvas.toDataURL('image/jpeg', quality);
        if (output.length <= 420_000) { resolve(output); return; }
      }
      reject(new Error('A imagem ainda ficou muito grande'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')); };
    img.src = url;
  });
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '12px 14px',
  borderRadius: 14, border: `1px solid ${T.border}`, background: T.surface2,
  color: T.t1, fontFamily: "'Area','Inter',sans-serif", fontSize: 14, outline: 'none',
};

function formatReminderDate(value: string, locale: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function localDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function ProSettingsPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation('settings');
  const { user, loading } = useAuth();
  const coverInput = useRef<HTMLInputElement>(null);
  const editedRef = useRef(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<ProSettings>(() => proSettingsStore.get());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listName, setListName] = useState('Quero assistir');
  const [reminderTitle, setReminderTitle] = useState('');
  const [mediaType, setMediaType] = useState<'tv' | 'movie'>('tv');
  const [remindAt, setRemindAt] = useState('');
  const [listsVersion, setListsVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setListsVersion((value) => value + 1);
    window.addEventListener('maratonou:sync', refresh);
    return () => window.removeEventListener('maratonou:sync', refresh);
  }, []);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return [...listStore.get('watching'), ...listStore.get('want'), ...listStore.get('favorites')]
      .filter((item) => {
        const key = `${item.type}_${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [listsVersion]);

  const themeChoices = useMemo<ProProfileTheme[]>(() => {
    const series = candidates.filter((item) => item.type === 'tv');
    return [DEFAULT_PRO_THEME, ...series.map((item, index) => {
      const palette = PALETTES[index % PALETTES.length];
      return {
        id: `series_${item.id}`,
        title: item.title,
        posterPath: item.poster_path ?? null,
        accent: palette.accent,
        gradient: palette.gradient,
      };
    })];
  }, [candidates]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    editedRef.current = false;
    const localProfile = profileStore.get(user.uid);
    const localSettings = proSettingsStore.get(user.uid);
    setProfile(localProfile);
    setSettings(localSettings);

    if (!firebaseConfigured) return;
    Promise.all([
      dbProfileStore.getOptional(getDB(), user.uid),
      dbProSettingsStore.get(getDB(), user.uid),
    ]).then(([cloudProfile, cloudSettings]) => {
      if (cancelled || editedRef.current) return;
      if (cloudProfile) {
        profileStore.set(cloudProfile, user.uid);
        setProfile(cloudProfile);
      }
      if (cloudSettings) {
        proSettingsStore.set(cloudSettings, user.uid);
        setSettings(proSettingsStore.get(user.uid));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loading, user]);

  const currentTheme = profile?.proTheme ?? DEFAULT_PRO_THEME;
  const isProMember = profile?.proMember === true;

  const chooseTheme = (theme: ProProfileTheme) => {
    editedRef.current = true;
    setProfile((current) => current ? { ...current, proTheme: theme, coverImage: '' } : current);
  };

  const handleCover = async (file?: File) => {
    if (!file) return;
    try {
      const coverImage = await compressCover(file);
      editedRef.current = true;
      setProfile((current) => current ? { ...current, coverImage } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('proSettings.coverError'));
      setTimeout(() => setError(null), 2800);
    }
  };

  const toggleHomeSection = (key: ProHomeSectionKey) => {
    const enabledCount = PRO_HOME_SECTION_KEYS.filter((section) => settings.homeSections[section]).length;
    if (settings.homeSections[key] && enabledCount === 1) {
      setError(t('proSettings.home.keepOne'));
      setTimeout(() => setError(null), 2400);
      return;
    }
    editedRef.current = true;
    setSettings((current) => ({
      ...current,
      homeSections: { ...current.homeSections, [key]: !current.homeSections[key] },
    }));
  };

  const addReminder = () => {
    const title = reminderTitle.trim();
    const customList = listName.trim();
    if (!title || !customList || !remindAt) {
      setError(t('proSettings.reminders.required'));
      setTimeout(() => setError(null), 2400);
      return;
    }
    const candidate = candidates.find((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase());
    const now = new Date().toISOString();
    editedRef.current = true;
    setSettings((current) => {
      const existingList = current.customLists.find((list) => list.name.toLocaleLowerCase() === customList.toLocaleLowerCase());
      const list = existingList ?? {
        id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: customList,
        notificationsEnabled: true,
        createdAt: now,
      };
      const reminder: ProReminder = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        listId: list.id,
        listName: list.name,
        title,
        mediaType: candidate?.type === 'movie' ? 'movie' : candidate?.type === 'tv' ? 'tv' : mediaType,
        remindAt,
        createdAt: now,
        tmdbId: candidate?.id,
        posterPath: candidate?.poster_path ?? null,
      };
      return {
        ...current,
        customLists: existingList ? current.customLists : [...current.customLists, list],
        reminders: [...current.reminders, reminder],
      };
    });
    setReminderTitle('');
    setRemindAt('');
  };

  const removeReminder = (id: string) => {
    editedRef.current = true;
    setSettings((current) => ({ ...current, reminders: current.reminders.filter((item) => item.id !== id) }));
  };

  const toggleListNotifications = (listId: string) => {
    editedRef.current = true;
    setSettings((current) => ({
      ...current,
      customLists: current.customLists.map((list) => list.id === listId
        ? { ...list, notificationsEnabled: !list.notificationsEnabled }
        : list),
    }));
  };

  const save = async () => {
    if (!user || !profile) return;
    if (!isProMember) { router.push('/pro'); return; }
    setSaving(true);
    const nextProfile = { ...profile, proTheme: currentTheme };
    profileStore.set(nextProfile, user.uid);
    proSettingsStore.set(settings, user.uid);
    const reminderSettings = syncProReminderNotifications(user.uid);
    if (firebaseConfigured) {
      try {
        await Promise.all([
          dbProfileStore.set(getDB(), user.uid, nextProfile),
          dbProSettingsStore.set(getDB(), user.uid, reminderSettings ?? proSettingsStore.get(user.uid)),
        ]);
      } catch {
        setSaving(false);
        setError(t('proSettings.saveError'));
        setTimeout(() => setError(null), 3200);
        return;
      }
    }
    editedRef.current = false;
    setSaving(false);
    setToast(t('proSettings.saved'));
    setTimeout(() => setToast(null), 2200);
  };

  if (loading || !profile) {
    return <Frame><Screen><SettingsHeader title={t('proSettings.title')} onBack={() => navigateBack(router, '/settings')} /><div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><Txt size={13} color={T.t3}>{t('proSettings.loading')}</Txt></div></Screen></Frame>;
  }

  return (
    <Frame>
      <Screen>
        <SettingsHeader title={t('proSettings.title')} onBack={() => navigateBack(router, '/settings')} />
        <ScrollArea>
          <div style={{ padding: '4px 16px 36px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ padding: '18px', borderRadius: 22, background: 'radial-gradient(circle at 90% 0%,rgba(245,197,24,0.23),transparent 36%),linear-gradient(135deg,#3a1b54,#171020 60%,#0d0d10)', border: '1px solid rgba(245,197,24,0.24)', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: 23, display: 'grid', placeItems: 'center', background: 'rgba(245,197,24,0.14)', border: '1px solid rgba(245,197,24,0.30)' }}><Icon name="crown" size={23} color={T.gold} /></div>
              <div style={{ flex: 1 }}>
                <Txt size={17} weight={900} color="#fff" style={{ display: 'block' }}>{t(isProMember ? 'proSettings.memberTitle' : 'proSettings.previewTitle')}</Txt>
                <Txt size={12} color="rgba(255,255,255,0.64)" style={{ display: 'block', marginTop: 3, lineHeight: 1.4 }}>{t(isProMember ? 'proSettings.memberSub' : 'proSettings.previewSub')}</Txt>
              </div>
            </div>

            <section>
              <Txt size={17} weight={900} style={{ display: 'block', marginBottom: 5 }}>{t('proSettings.profile.title')}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.45, marginBottom: 12 }}>{t('proSettings.profile.detail')}</Txt>
              <SettingsCard style={{ padding: 14 }}>
                <div style={{ height: 138, borderRadius: 16, overflow: 'hidden', position: 'relative', background: currentTheme.gradient, marginBottom: 14 }}>
                  {(profile.coverImage || currentTheme.posterPath) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.coverImage || tmdbImg(currentTheme.posterPath, 'w780') || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top,${currentTheme.accent}66,transparent 68%)` }} />
                  <div style={{ position: 'absolute', left: 12, bottom: 11, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ padding: '4px 8px', borderRadius: 10, background: '#0b0b0dcc', color: '#fff', fontSize: 10, fontWeight: 900 }}>PRO</span>
                    <Txt size={13} weight={800} color="#fff">{currentTheme.title}</Txt>
                  </div>
                </div>

                <Txt size={11} weight={800} color={T.t3} style={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 9 }}>{t('proSettings.profile.theme')}</Txt>
                <div style={{ display: 'flex', gap: 9, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 5 } as React.CSSProperties}>
                  {themeChoices.map((theme) => {
                    const selected = currentTheme.id === theme.id;
                    const poster = tmdbImg(theme.posterPath, 'w185');
                    return (
                      <button key={theme.id} type="button" onClick={() => chooseTheme(theme)} style={{ width: 88, flexShrink: 0, padding: 0, borderRadius: 14, overflow: 'hidden', border: selected ? `2px solid ${theme.accent}` : `1px solid ${T.border}`, background: T.surface2, cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ height: 72, background: theme.gradient, position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {poster && <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                          {selected && <div style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, display: 'grid', placeItems: 'center', background: theme.accent }}><Icon name="check" size={13} color="#fff" /></div>}
                        </div>
                        <Txt size={10} weight={700} color={T.t2} style={{ display: 'block', padding: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{theme.title}</Txt>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  <button type="button" onClick={() => coverInput.current?.click()} style={{ flex: 1, minHeight: 42, borderRadius: 21, border: `1px solid ${T.border}`, background: T.surface2, color: T.t1, fontFamily: "'Area',sans-serif", fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{t('proSettings.profile.uploadCover')}</button>
                  {profile.coverImage && <button type="button" onClick={() => { editedRef.current = true; setProfile((current) => current ? { ...current, coverImage: '' } : current); }} style={{ minHeight: 42, padding: '0 14px', borderRadius: 21, border: '1px solid rgba(255,90,95,0.28)', background: 'rgba(255,90,95,0.10)', color: '#FF7378', fontFamily: "'Area',sans-serif", fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{t('proSettings.profile.removeCover')}</button>}
                </div>
                <input ref={coverInput} type="file" accept="image/*" hidden onChange={(event) => { void handleCover(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              </SettingsCard>
            </section>

            <section>
              <Txt size={17} weight={900} style={{ display: 'block', marginBottom: 5 }}>{t('proSettings.badges.title')}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.45, marginBottom: 12 }}>{t('proSettings.badges.detail')}</Txt>
              <SettingsCard style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, display: 'grid', placeItems: 'center', background: T.goldDim, border: '1px solid rgba(245,197,24,0.25)' }}><Icon name="award" size={24} color={T.gold} /></div>
                <div style={{ flex: 1 }}><Txt size={14} weight={800} style={{ display: 'block' }}>{t('proSettings.badges.current')}</Txt><Txt size={11} color={T.t3} style={{ display: 'block', marginTop: 3 }}>{t('proSettings.badges.comingSoon')}</Txt></div>
                <span style={{ padding: '5px 9px', borderRadius: 12, background: T.goldDim, color: T.gold, fontSize: 10, fontWeight: 900 }}>PRO</span>
              </SettingsCard>
            </section>

            <section>
              <Txt size={17} weight={900} style={{ display: 'block', marginBottom: 5 }}>{t('proSettings.home.title')}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.45, marginBottom: 12 }}>{t('proSettings.home.detail')}</Txt>
              <SettingsCard>
                {PRO_HOME_SECTION_KEYS.map((key, index) => {
                  const on = settings.homeSections[key];
                  const row = HOME_LABELS[key];
                  return (
                    <button key={key} type="button" onClick={() => toggleHomeSection(key)} style={{ width: '100%', minHeight: 58, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', borderBottom: index < PRO_HOME_SECTION_KEYS.length - 1 ? `1px solid ${T.border}` : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                      <Icon name={row.icon} size={18} color={on ? currentTheme.accent : T.t3} />
                      <Txt size={13} weight={700} color={on ? T.t1 : T.t3} style={{ flex: 1 }}>{t(`proSettings.home.sections.${row.key}`)}</Txt>
                      <span role="switch" aria-checked={on} style={{ width: 44, height: 27, borderRadius: 14, position: 'relative', background: on ? currentTheme.accent : T.surface2, border: `1px solid ${on ? currentTheme.accent : T.border}`, transition: 'background .2s' }}><span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 21, height: 21, borderRadius: 11, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.28)', transition: 'left .2s' }} /></span>
                    </button>
                  );
                })}
              </SettingsCard>
            </section>

            <section id="reminders">
              <Txt size={17} weight={900} style={{ display: 'block', marginBottom: 5 }}>{t('proSettings.reminders.title')}</Txt>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.45, marginBottom: 12 }}>{t('proSettings.reminders.detail')}</Txt>
              <SettingsCard style={{ padding: 14 }}>
                <div style={{ display: 'grid', gap: 9 }}>
                  <input value={listName} onChange={(event) => setListName(event.target.value)} placeholder={t('proSettings.reminders.listPlaceholder')} style={inputStyle} />
                  <input value={reminderTitle} onChange={(event) => setReminderTitle(event.target.value)} placeholder={t('proSettings.reminders.titlePlaceholder')} list="pro-title-options" style={inputStyle} />
                  <datalist id="pro-title-options">{candidates.map((item) => <option key={`${item.type}_${item.id}`} value={item.title} />)}</datalist>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                    <select value={mediaType} onChange={(event) => setMediaType(event.target.value as 'tv' | 'movie')} style={inputStyle}><option value="tv">{t('proSettings.reminders.series')}</option><option value="movie">{t('proSettings.reminders.movie')}</option></select>
                  <input type="date" min={localDateInputValue()} value={remindAt} onChange={(event) => setRemindAt(event.target.value)} style={inputStyle} />
                  </div>
                  <button type="button" onClick={addReminder} style={{ minHeight: 46, borderRadius: 23, border: 'none', background: currentTheme.accent, color: '#fff', fontFamily: "'Area',sans-serif", fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>{t('proSettings.reminders.add')}</button>
                </div>

                {settings.reminders.length > 0 && <div style={{ height: 1, background: T.border, margin: '15px 0 10px' }} />}
                {settings.customLists.filter((list) => settings.reminders.some((reminder) => reminder.listId === list.id)).map((list) => {
                  const reminders = settings.reminders.filter((reminder) => reminder.listId === list.id).sort((a, b) => a.remindAt.localeCompare(b.remindAt));
                  return (
                    <div key={list.id} style={{ padding: '8px 0 3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                        <Icon name="bookmark" size={15} color={currentTheme.accent} />
                        <Txt size={12} weight={900} style={{ flex: 1 }}>{list.name}</Txt>
                        <button type="button" role="switch" aria-checked={list.notificationsEnabled} aria-label={t('proSettings.reminders.notificationsToggle', { name: list.name })} onClick={() => toggleListNotifications(list.id)} style={{ width: 38, height: 24, borderRadius: 12, position: 'relative', border: 'none', background: list.notificationsEnabled ? currentTheme.accent : T.surface2, cursor: 'pointer' }}>
                          <span style={{ position: 'absolute', top: 2, left: list.notificationsEnabled ? 16 : 2, width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                        </button>
                      </div>
                      {reminders.map((reminder) => (
                        <div key={reminder.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                          <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', background: T.surface2, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {reminder.posterPath ? <img src={tmdbImg(reminder.posterPath, 'w154') || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name={reminder.mediaType === 'tv' ? 'tv' : 'film'} size={18} color={T.t3} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}><Txt size={12} weight={800} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reminder.title}</Txt><Txt size={10} color={T.t3} style={{ display: 'block', marginTop: 3 }}>{formatReminderDate(reminder.remindAt, i18n.language)}</Txt></div>
                          <button type="button" aria-label={t('proSettings.reminders.remove')} onClick={() => removeReminder(reminder.id)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(255,90,95,.10)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="close" size={15} color="#FF7378" /></button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </SettingsCard>
            </section>

            <SettingsPrimaryButton label={isProMember ? (saving ? t('proSettings.saving') : t('proSettings.save')) : t('proSettings.activate')} onClick={() => { void save(); }} disabled={saving} style={{ background: currentTheme.accent }} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} />
        <Toast msg={error} visible={!!error} />
      </Screen>
    </Frame>
  );
}
