'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader, SettingsPrimaryButton, settingsInputStyle } from '@/components/SettingsLayout';
import { T } from '@/lib/tokens';
import { profileStore, type Profile } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, firebaseStorageEnabled, getDB } from '@/lib/firebase';
import { dbProfileStore, isUsernameTaken } from '@/lib/db';
import { navigateBack } from '@/lib/navigation';
import { slugifyUsername, USERNAME_FALLBACK } from '@/lib/username';
import { useTranslation } from 'react-i18next';
import { createProfileImagePreview, removeProfileImages, uploadProfileImage } from '@/lib/imageStorage';
import '@/lib/i18n';

const GRADIENTS = [
  'linear-gradient(135deg,#C069FF,#c030a0)',
  'linear-gradient(135deg,#E50914,#a00000)',
  'linear-gradient(135deg,#3b82f6,#1d4ed8)',
  'linear-gradient(135deg,#10b981,#047857)',
  'linear-gradient(135deg,#f59e0b,#b45309)',
  'linear-gradient(135deg,#8b5cf6,#6d28d9)',
  'linear-gradient(135deg,#ec4899,#be185d)',
  'linear-gradient(135deg,#06b6d4,#0e7490)',
];

const INPUT: React.CSSProperties = {
  ...settingsInputStyle,
  padding: '7px 0 0',
};

export default function EditProfilePage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastErr, setToastErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef  = useRef<HTMLInputElement>(null);
  // Username as it was when the form loaded — used to detect a rename
  // and to keep the previous slug resolvable via profile.aliases.
  const originalUsernameRef = useRef<string>('');
  const originalMediaRef = useRef({ avatarImage: '', avatarThumbImage: '', coverImage: '' });

  // Wait for Firebase auth to resolve, then build the editable profile.
  useEffect(() => {
    if (loading) return;
    const local = profileStore.get(user?.uid);

    const buildProfile = (base: Profile, cloudOverride?: Partial<Profile>) => {
      const merged = cloudOverride ? { ...base, ...cloudOverride } : base;
      if (!user) return merged;
      const resolvedName = merged.name || user.displayName || 'Usuário';
      return {
        ...merged,
        name:         resolvedName,
        // The username is the slug of the Name (João Miguel → joao-miguel)
        username:     merged.username || slugifyUsername(resolvedName) || slugifyUsername(user.email?.split('@')[0] || '') || USERNAME_FALLBACK,
        avatarImage:  merged.avatarImage || user.photoURL || '',
        avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
      };
    };

    const initial = buildProfile(local);
    originalUsernameRef.current = initial.username;
    originalMediaRef.current = {
      avatarImage: initial.avatarImage || '',
      avatarThumbImage: initial.avatarThumbImage || '',
      coverImage: initial.coverImage || '',
    };
    setProfile(initial);

    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          const merged = buildProfile(local, cloud);
          originalUsernameRef.current = merged.username;
          originalMediaRef.current = {
            avatarImage: merged.avatarImage || '',
            avatarThumbImage: merged.avatarThumbImage || '',
            coverImage: merged.coverImage || '',
          };
          profileStore.set(merged, user.uid);
          setProfile(merged);
        }
      }).catch(() => {});
    }
  }, [user, loading]);

  const update = (field: keyof Profile, val: unknown) =>
    setProfile(p => p ? ({ ...p, [field]: val }) : p);

  const updateSocial = (key: keyof Profile['social'], val: string) =>
    setProfile(p => p ? ({ ...p, social: { ...p.social, [key]: val } }) : p);

  const handleFile = async (file: File | undefined, field: 'avatarImage' | 'coverImage') => {
    if (!file) return;
    try {
      const preview = await createProfileImagePreview(file, field === 'avatarImage' ? 'avatar' : 'cover');
      setProfile((current) => {
        if (current?.[field]?.startsWith('blob:')) URL.revokeObjectURL(current[field]);
        return current ? { ...current, [field]: preview } : current;
      });
      if (field === 'avatarImage') setPendingAvatar(file);
      else setPendingCover(file);
    } catch (e: unknown) {
      setToastErr(e instanceof Error ? e.message : 'Erro');
      setTimeout(() => setToastErr(null), 2500);
    }
  };

  const clearImage = (field: 'avatarImage' | 'coverImage') => {
    setProfile((current) => {
      if (current?.[field]?.startsWith('blob:')) URL.revokeObjectURL(current[field]);
      if (!current) return current;
      return field === 'avatarImage'
        ? { ...current, avatarImage: '', avatarThumbImage: '' }
        : { ...current, coverImage: '' };
    });
    if (field === 'avatarImage') setPendingAvatar(null);
    else setPendingCover(null);
  };

  const openImagePicker = (input: React.RefObject<HTMLInputElement | null>) => {
    if (!firebaseStorageEnabled) {
      setToastErr(t('editProfile.storagePending'));
      setTimeout(() => setToastErr(null), 3000);
      return;
    }
    input.current?.click();
  };

  const save = async () => {
    if (!profile || saving) return;

    // Normalise the username to a valid slug (it drives the /user/<slug> URL)
    const desired = slugifyUsername(profile.username);
    if (!desired) {
      setToastErr(t('editProfile.usernameInvalid'));
      setTimeout(() => setToastErr(null), 2500);
      return;
    }

    const previous = originalUsernameRef.current;
    const renamed  = desired !== previous;

    // Reject a username that already belongs to somebody else
    if (renamed && user && firebaseConfigured) {
      try {
        if (await isUsernameTaken(getDB(), desired, user.uid)) {
          setToastErr(t('editProfile.usernameInUse'));
          setTimeout(() => setToastErr(null), 2500);
          return;
        }
      } catch {}
    }

    // Keep the old username resolvable so shared links don't break.
    // usernameCustom pins this choice — the automatic slug migration
    // must never re-derive it from the Name afterwards.
    let next: Profile = {
      ...profile,
      username: desired,
      aliases: renamed && previous
        ? Array.from(new Set([...(profile.aliases ?? []), previous]))
        : (profile.aliases ?? []),
      usernameMigrated: true,
      ...(renamed ? { usernameCustom: true } : {}),
    };
    setSaving(true);
    const uploadedUrls: string[] = [];
    try {
      if ((pendingAvatar || pendingCover) && (!user || !firebaseConfigured)) {
        throw new Error('Entre na sua conta para enviar imagens.');
      }
      if (user && firebaseConfigured) {
        if (pendingAvatar) {
          const uploaded = await uploadProfileImage(user.uid, 'avatar', pendingAvatar);
          uploadedUrls.push(uploaded.url, uploaded.thumbUrl || '');
          next = { ...next, avatarImage: uploaded.url, avatarThumbImage: uploaded.thumbUrl || uploaded.url };
        }
        if (pendingCover) {
          const uploaded = await uploadProfileImage(user.uid, 'cover', pendingCover);
          uploadedUrls.push(uploaded.url);
          next = { ...next, coverImage: uploaded.url };
        }
        await dbProfileStore.set(getDB(), user.uid, next);

        const old = originalMediaRef.current;
        await Promise.all([
          (pendingAvatar || !next.avatarImage) && old.avatarImage
            ? removeProfileImages(old.avatarImage, old.avatarThumbImage)
            : Promise.resolve(),
          (pendingCover || !next.coverImage) && old.coverImage
            ? removeProfileImages(old.coverImage)
            : Promise.resolve(),
        ]);
      }

      profileStore.set(next, user?.uid);
      setProfile(next);
      originalUsernameRef.current = desired;
      originalMediaRef.current = {
        avatarImage: next.avatarImage || '',
        avatarThumbImage: next.avatarThumbImage || '',
        coverImage: next.coverImage || '',
      };

      if (user) {
        try {
          const { updateProfile } = await import('firebase/auth');
          const { getFirebaseAuth } = await import('@/lib/firebase');
          const currentUser = getFirebaseAuth().currentUser;
          if (currentUser) await updateProfile(currentUser, { displayName: next.name, photoURL: next.avatarImage || null });
        } catch {}
      }
      setToast(t('editProfile.saved'));
      setTimeout(() => router.replace(`/user/${encodeURIComponent(desired)}`), 1200);
    } catch (error) {
      if (uploadedUrls.length) await Promise.all(uploadedUrls.filter(Boolean).map((url) => removeProfileImages(url)));
      setToastErr(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.');
      setTimeout(() => setToastErr(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  // Show skeleton while auth resolves
  if (loading || !profile) {
    return (
      <Frame>
        <Screen>
          <SettingsHeader title="Editar perfil" onBack={() => navigateBack(router, '/settings')} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 32 }}>
            <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--c-glass-bg)' }} />
            <div style={{ width: 160, height: 14, borderRadius: 7, background: 'var(--c-glass-bg)' }} />
            <div style={{ width: 110, height: 12, borderRadius: 6, background: 'var(--c-input-bg)' }} />
          </div>
        </Screen>
      </Frame>
    );
  }

  const avatarLetter = profile.name?.trim()?.[0]?.toUpperCase() || 'U';

  return (
    <Frame>
      <Screen>
        <SettingsHeader title={t('editProfile.title')} onBack={() => navigateBack(router, '/settings')} />
        <ScrollArea>
          <div style={{ padding: '12px 0 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* ── Cover image ── */}
            <div style={{ position: 'relative', margin: '0 16px' }}>
              {/* cover area */}
              <div
                style={{
                  height: 132, borderRadius: 20, overflow: 'hidden',
                  background: profile.coverImage
                    ? `url(${profile.coverImage}) center/cover no-repeat`
                    : 'linear-gradient(160deg,#2a1a3a 0%,#1a1a2a 60%,#0a0a1a 100%)',
                  position: 'relative',
                }}
              >
                {/* edit cover button */}
                <button
                  onClick={() => openImagePicker(coverInputRef)}
                  style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(0,0,0,0.6)', border: `1px solid ${T.dim}`, borderRadius: 20, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
                >
                  <Icon name="film" size={13} color={T.white} />
                  <Txt size={12} weight={600} color={T.white}>{t('editProfile.editCover')}</Txt>
                </button>
                {profile.coverImage && (
                  <button
                    onClick={() => clearImage('coverImage')}
                    style={{ position: 'absolute', bottom: 10, right: 130, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(229,9,20,0.7)', border: 'none', borderRadius: 20, cursor: 'pointer' }}
                  >
                    <Icon name="close" size={11} color={T.white} />
                    <Txt size={12} weight={600} color={T.white}>{t('remove', { ns: 'common' })}</Txt>
                  </button>
                )}
              </div>

              {/* avatar overlapping cover */}
              <div style={{ position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)' }}>
                <div style={{ position: 'relative', width: 96, height: 96 }}>
                  {/* circle */}
                  <div style={{ width: 96, height: 96, borderRadius: 48, background: profile.avatarImage ? `url(${profile.avatarImage}) center/cover no-repeat` : profile.avatarGradient, border: `4px solid ${T.bg}`, boxShadow: '0 4px 20px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {!profile.avatarImage && <Txt size={30} weight={900} color="#fff">{avatarLetter}</Txt>}
                  </div>
                  {/* camera button */}
                  <button
                    onClick={() => openImagePicker(avatarInputRef)}
                    aria-label={t('editProfile.avatarHint')}
                    style={{ position: 'absolute', bottom: 1, right: -2, width: 32, height: 32, borderRadius: 16, background: T.pink, border: `3px solid ${T.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Icon name="plus" size={13} color={T.white} />
                  </button>
                </div>
              </div>

              {/* spacer for overlapping avatar */}
              <div style={{ height: 58 }} />
            </div>

            {/* hidden file inputs */}
            <input ref={avatarInputRef} type="file" accept="image/*" disabled={!firebaseStorageEnabled} style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'avatarImage')} />
            <input ref={coverInputRef}  type="file" accept="image/*" disabled={!firebaseStorageEnabled} style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'coverImage')} />

            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* remove avatar photo */}
              {profile.avatarImage && (
                <button
                  onClick={() => clearImage('avatarImage')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 18, cursor: 'pointer', alignSelf: 'center' }}
                >
                  <Icon name="close" size={13} color={T.red} />
                  <Txt size={13} weight={600} color={T.red}>{t('editProfile.removePhoto')}</Txt>
                </button>
              )}

              {/* gradient picker (only when no avatar photo) */}
              {!profile.avatarImage && (
                <SettingsCard style={{ padding: 16 }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('editProfile.avatarColor')}</Txt>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {GRADIENTS.map((g) => (
                      <button
                        key={g}
                        onClick={() => update('avatarGradient', g)}
                        style={{ width: 36, height: 36, borderRadius: 18, background: g, border: profile.avatarGradient === g ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', transition: 'border 0.15s' }}
                      />
                    ))}
                  </div>
                </SettingsCard>
              )}

              {/* Name & username */}
              <SettingsCard>
                <div style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block' }}>{t('editProfile.nameLabel')}</Txt>
                  <input style={INPUT} value={profile.name} placeholder={t('editProfile.namePlaceholder')} onChange={e => update('name', e.target.value)} />
                </div>
                <div style={{ padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block' }}>{t('editProfile.usernameLabel')}</Txt>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, bottom: 0, color: T.t3, fontSize: 14 }}>@</span>
                    <input style={{ ...INPUT, paddingLeft: 16 }} value={profile.username} placeholder="joao-miguel"
                      onChange={e => update('username', e.target.value
                        .normalize('NFD').replace(/[̀-ͯ]/g, '')
                        .toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30))} />
                  </div>
                </div>
                <div style={{ padding: '13px 16px 10px' }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block' }}>{t('editProfile.bioLabel')}</Txt>
                  <textarea style={{ ...INPUT, minHeight: 72, resize: 'none' }} value={profile.bio}
                    placeholder={t('editProfile.bioPlaceholder')} maxLength={160}
                    onChange={e => update('bio', e.target.value)} />
                  <Txt size={11} color={T.t4} style={{ display: 'block', textAlign: 'right', marginTop: 4 }}>{profile.bio.length}/160</Txt>
                </div>
              </SettingsCard>

              {/* Social links */}
              <div>
                <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('editProfile.socialLinks')}</Txt>
                <SettingsCard>
                  {([
                    { key: 'instagram'  as const, label: 'Instagram',   placeholder: '@seuinsta',    color: '#e1306c' },
                    { key: 'twitter'    as const, label: 'X / Twitter', placeholder: '@seutwitter',  color: '#1d9bf0' },
                    { key: 'letterboxd' as const, label: 'Letterboxd',  placeholder: 'usuario',       color: '#00c030' },
                  ] as const).map(({ key, label, placeholder, color }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: key !== 'letterboxd' ? `1px solid ${T.border}` : 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="share" size={16} color={color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Txt size={11} color={T.t3} style={{ display: 'block', marginBottom: 4 }}>{label}</Txt>
                        <input style={{ ...INPUT, padding: '4px 0 0' }} value={profile.social[key]}
                          placeholder={placeholder} onChange={e => updateSocial(key, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </SettingsCard>
              </div>

              <SettingsPrimaryButton label={saving ? 'Salvando…' : t('editProfile.saveChanges')} onClick={save} disabled={saving} />
            </div>
          </div>
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} icon="check" />
        <Toast msg={toastErr} visible={!!toastErr} icon="close" />
      </Screen>
    </Frame>
  );
}
