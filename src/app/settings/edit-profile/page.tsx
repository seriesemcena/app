'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt, Btn, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { profileStore, type Profile } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbProfileStore } from '@/lib/db';

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
  width: '100%', padding: '13px 14px',
  background: 'var(--c-input-bg)',
  border: '1px solid var(--c-border)',
  borderRadius: 12, color: T.t1, fontSize: 14,
  fontFamily: "'Area','Inter',sans-serif",
  outline: 'none', boxSizing: 'border-box',
};

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    if (file.size > MAX_SIZE) { rej(new Error('Arquivo muito grande (máx 2 MB)')); return; }
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.onerror = () => rej(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export default function EditProfilePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastErr, setToastErr] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef  = useRef<HTMLInputElement>(null);

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
        username:     merged.username || user.email?.split('@')[0] || 'usuario',
        avatarImage:  merged.avatarImage || user.photoURL || '',
        avatarLetter: resolvedName[0]?.toUpperCase() || 'U',
      };
    };

    setProfile(buildProfile(local));

    if (user && firebaseConfigured) {
      dbProfileStore.get(getDB(), user.uid).then(cloud => {
        if (cloud && (cloud.name || cloud.username || cloud.bio)) {
          const merged = buildProfile(local, cloud);
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
      const data = await readFile(file);
      update(field, data);
    } catch (e: unknown) {
      setToastErr(e instanceof Error ? e.message : 'Erro');
      setTimeout(() => setToastErr(null), 2500);
    }
  };

  const save = async () => {
    if (!profile) return;
    // 1. Persist to localStorage immediately
    profileStore.set(profile, user?.uid);
    setToast('Perfil salvo!');
    setTimeout(() => router.back(), 1200);

    if (user) {
      // 2. Update Firebase Auth (displayName + photoURL for cross-device name)
      try {
        const { updateProfile } = await import('firebase/auth');
        const { getFirebaseAuth } = await import('@/lib/firebase');
        const currentUser = getFirebaseAuth().currentUser;
        if (currentUser) {
          await updateProfile(currentUser, {
            displayName: profile.name,
            ...(profile.avatarImage && !profile.avatarImage.startsWith('data:')
              ? { photoURL: profile.avatarImage }
              : {}),
          });
        }
      } catch {}

      // 3. Save ALL profile fields to Firestore (bio, username, social, avatar, cover, etc.)
      if (firebaseConfigured) {
        try { await dbProfileStore.set(getDB(), user.uid, profile); } catch {}
      }
    }
  };

  // Show skeleton while auth resolves
  if (loading || !profile) {
    return (
      <Frame>
        <Screen>
          <AppBar title="Editar perfil" left={
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name="chevronL" size={20} color={T.t2} />
            </button>
          } />
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
        <AppBar
          title="Editar perfil"
          left={
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <Icon name="chevronL" size={20} color={T.t2} />
            </button>
          }
          right={
            <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <Txt size={14} weight={700} color={T.pink}>Salvar</Txt>
            </button>
          }
        />
        <ScrollArea>
          <div style={{ padding: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Cover image ── */}
            <div style={{ position: 'relative' }}>
              {/* cover area */}
              <div
                style={{
                  height: 140,
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
                  <Txt size={12} weight={600} color={T.white}>Editar capa</Txt>
                </button>
                {profile.coverImage && (
                  <button
                    onClick={() => update('coverImage', '')}
                    style={{ position: 'absolute', bottom: 10, right: 130, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(229,9,20,0.7)', border: 'none', borderRadius: 20, cursor: 'pointer' }}
                  >
                    <Icon name="close" size={11} color={T.white} />
                    <Txt size={12} weight={600} color={T.white}>Remover</Txt>
                  </button>
                )}
              </div>

              {/* avatar overlapping cover */}
              <div style={{ position: 'absolute', bottom: -40, left: 20 }}>
                <div style={{ position: 'relative', width: 80, height: 80 }}>
                  {/* circle */}
                  <div style={{ width: 80, height: 80, borderRadius: 40, background: profile.avatarImage ? `url(${profile.avatarImage}) center/cover no-repeat` : profile.avatarGradient, border: `3px solid ${T.bg}`, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {!profile.avatarImage && <Txt size={30} weight={900} color="#fff">{avatarLetter}</Txt>}
                  </div>
                  {/* camera button */}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    style={{ position: 'absolute', bottom: 0, right: -2, width: 26, height: 26, borderRadius: 13, background: T.pink, border: `2px solid ${T.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Icon name="plus" size={13} color={T.white} />
                  </button>
                </div>
              </div>

              {/* spacer for overlapping avatar */}
              <div style={{ height: 50 }} />
            </div>

            {/* hidden file inputs */}
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'avatarImage')} />
            <input ref={coverInputRef}  type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0], 'coverImage')} />

            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* remove avatar photo */}
              {profile.avatarImage && (
                <button
                  onClick={() => update('avatarImage', '')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: T.redDim, border: `1px solid rgba(229,9,20,0.3)`, borderRadius: 10, cursor: 'pointer', alignSelf: 'flex-start' }}
                >
                  <Icon name="close" size={13} color={T.red} />
                  <Txt size={13} weight={600} color={T.red}>Remover foto de perfil</Txt>
                </button>
              )}

              {/* gradient picker (only when no avatar photo) */}
              {!profile.avatarImage && (
                <div>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>Cor do avatar</Txt>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {GRADIENTS.map((g) => (
                      <button
                        key={g}
                        onClick={() => update('avatarGradient', g)}
                        style={{ width: 36, height: 36, borderRadius: 18, background: g, border: profile.avatarGradient === g ? '3px solid #fff' : '3px solid transparent', cursor: 'pointer', transition: 'border 0.15s' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Name & username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Nome</Txt>
                  <input style={INPUT} value={profile.name} placeholder="Seu nome" onChange={e => update('name', e.target.value)} />
                </div>
                <div>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Username</Txt>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.t3, fontSize: 14 }}>@</span>
                    <input style={{ ...INPUT, paddingLeft: 28 }} value={profile.username} placeholder="seuusername"
                      onChange={e => update('username', e.target.value.replace(/\s/g, '').toLowerCase())} />
                  </div>
                </div>
                <div>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Bio</Txt>
                  <textarea style={{ ...INPUT, minHeight: 80, resize: 'none' }} value={profile.bio}
                    placeholder="Conte um pouco sobre você..." maxLength={160}
                    onChange={e => update('bio', e.target.value)} />
                  <Txt size={11} color={T.t4} style={{ display: 'block', textAlign: 'right', marginTop: 4 }}>{profile.bio.length}/160</Txt>
                </div>
              </div>

              {/* Social links */}
              <div>
                <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Redes sociais</Txt>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    { key: 'instagram' as const, label: 'Instagram', placeholder: '@seuinsta', color: '#e1306c' },
                    { key: 'twitter'   as const, label: 'X / Twitter', placeholder: '@seutwitter', color: '#1d9bf0' },
                    { key: 'letterboxd' as const, label: 'Letterboxd', placeholder: 'usuario', color: '#00c030' },
                  ] as const).map(({ key, label, placeholder, color }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="share" size={16} color={color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Txt size={11} color={T.t3} style={{ display: 'block', marginBottom: 4 }}>{label}</Txt>
                        <input style={{ ...INPUT, padding: '9px 12px' }} value={profile.social[key]}
                          placeholder={placeholder} onChange={e => updateSocial(key, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Btn label="Salvar alterações" variant="pink" full onClick={save} />
            </div>
          </div>
        </ScrollArea>

        <Toast msg={toast} visible={!!toast} icon="check" />
        <Toast msg={toastErr} visible={!!toastErr} icon="close" />
      </Screen>
    </Frame>
  );
}
