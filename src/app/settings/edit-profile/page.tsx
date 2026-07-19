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
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore, isUsernameTaken } from '@/lib/db';
import { navigateBack } from '@/lib/navigation';
import { slugifyUsername, USERNAME_FALLBACK } from '@/lib/username';
import { useTranslation } from 'react-i18next';
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

/* Images are stored as base64 INSIDE the users/{uid} Firestore doc, which has
   a hard 1 MiB limit shared with the lists/episodes data. An uncompressed
   upload silently broke ALL syncing for the account once the doc overflowed —
   so every image is resized + recompressed down to a small JPEG here. */
const MAX_INPUT   = 15 * 1024 * 1024; // refuse absurd source files
const TARGET_B64  = 300_000;          // ~220 KB binary per image
const HARD_B64    = 450_000;          // give up beyond this — protect the doc

function drawScaled(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale  = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w      = Math.max(1, Math.round(img.width  * scale));
  const h      = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Erro ao processar imagem');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function compressImage(file: File, maxDim: number): Promise<string> {
  return new Promise((res, rej) => {
    if (file.size > MAX_INPUT) { rej(new Error('Arquivo muito grande (máx 15 MB)')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let out = drawScaled(img, maxDim, 0.82);
        // Still heavy? Trade quality first, then dimensions.
        if (out.length > TARGET_B64) out = drawScaled(img, maxDim, 0.6);
        if (out.length > TARGET_B64) out = drawScaled(img, Math.round(maxDim * 0.7), 0.6);
        if (out.length > HARD_B64) { rej(new Error('Imagem grande demais')); return; }
        res(out);
      } catch (e) { rej(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Erro ao ler arquivo')); };
    img.src = url;
  });
}

export default function EditProfilePage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastErr, setToastErr] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef  = useRef<HTMLInputElement>(null);
  // Username as it was when the form loaded — used to detect a rename
  // and to keep the previous slug resolvable via profile.aliases.
  const originalUsernameRef = useRef<string>('');

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
    setProfile(initial);

    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          const merged = buildProfile(local, cloud);
          originalUsernameRef.current = merged.username;
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
      // Avatar renders at 80px; cover is a wide banner — cap dimensions accordingly.
      const data = await compressImage(file, field === 'avatarImage' ? 512 : 1280);
      update(field, data);
    } catch (e: unknown) {
      setToastErr(e instanceof Error ? e.message : 'Erro');
      setTimeout(() => setToastErr(null), 2500);
    }
  };

  const save = async () => {
    if (!profile) return;

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
    const next: Profile = {
      ...profile,
      username: desired,
      aliases: renamed && previous
        ? Array.from(new Set([...(profile.aliases ?? []), previous]))
        : (profile.aliases ?? []),
      usernameMigrated: true,
      ...(renamed ? { usernameCustom: true } : {}),
    };
    setProfile(next);
    originalUsernameRef.current = desired;

    // 1. Persist to localStorage immediately
    profileStore.set(next, user?.uid);
    setToast(t('editProfile.saved'));
    setTimeout(() => router.replace(`/user/${encodeURIComponent(desired)}`), 1200);

    if (user) {
      // 2. Update Firebase Auth (displayName + photoURL for cross-device name)
      try {
        const { updateProfile } = await import('firebase/auth');
        const { getFirebaseAuth } = await import('@/lib/firebase');
        const currentUser = getFirebaseAuth().currentUser;
        if (currentUser) {
          await updateProfile(currentUser, {
            displayName: next.name,
            ...(next.avatarImage && !next.avatarImage.startsWith('data:')
              ? { photoURL: next.avatarImage }
              : {}),
          });
        }
      } catch {}

      // 3. Save ALL profile fields to Firestore (bio, username, social, avatar, cover, etc.)
      if (firebaseConfigured) {
        try { await dbProfileStore.set(getDB(), user.uid, next); } catch {}
      }
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
                  onClick={() => coverInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(0,0,0,0.6)', border: `1px solid ${T.dim}`, borderRadius: 20, cursor: 'pointer', backdropFilter: 'blur(8px)' }}
                >
                  <Icon name="film" size={13} color={T.white} />
                  <Txt size={12} weight={600} color={T.white}>{t('editProfile.editCover')}</Txt>
                </button>
                {profile.coverImage && (
                  <button
                    onClick={() => update('coverImage', '')}
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
                    onClick={() => avatarInputRef.current?.click()}
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
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'avatarImage')} />
            <input ref={coverInputRef}  type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'coverImage')} />

            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* remove avatar photo */}
              {profile.avatarImage && (
                <button
                  onClick={() => update('avatarImage', '')}
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

              <SettingsPrimaryButton label={t('editProfile.saveChanges')} onClick={save} />
            </div>
          </div>
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} icon="check" />
        <Toast msg={toastErr} visible={!!toastErr} icon="close" />
      </Screen>
    </Frame>
  );
}
