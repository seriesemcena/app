'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, Logo } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { tmdb, tmdbImg, useTMDB, type TMDBItem } from '@/lib/tmdb';

const ANIM_CSS = `
  @keyframes scrollUp   { 0% { transform: translateY(0);    } 100% { transform: translateY(-50%); } }
  @keyframes scrollDown { 0% { transform: translateY(-50%); } 100% { transform: translateY(0);    } }
  .poster-col-up   { animation: scrollUp   30s linear infinite; }
  .poster-col-down { animation: scrollDown 36s linear infinite; }
  @keyframes spin{to{transform:rotate(360deg)}}
`;

function PosterCol({ items, animClass }: { items: TMDBItem[]; animClass: string }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
      <div className={animClass} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {doubled.map((item, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${item.id}-${i}`} src={tmdbImg(item.poster_path, 'w185') ?? ''} alt=""
            style={{ width: '100%', borderRadius: 10, display: 'block' }} />
        ))}
      </div>
    </div>
  );
}

const SparkleIcon = ({ size = 20, color = '#C069FF' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M16 2 L17.6 13.4 L29 16 L17.6 18.6 L16 30 L14.4 18.6 L3 16 L14.4 13.4 Z" fill={color} />
  </svg>
);

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0112 4.9c1.96 0 3.73.72 5.09 1.9l3.78-3.78A12 12 0 000 12c0 1.99.48 3.86 1.34 5.53l3.93-3.93a7 7 0 010-3.84z"/>
    <path fill="#34A853" d="M12 24a12 12 0 008.08-3.12l-3.99-3.27a7.08 7.08 0 01-4.09 1.3A7.1 7.1 0 015.18 14.3l-3.84 2.96A12 12 0 0012 24z"/>
    <path fill="#4A90E2" d="M23.89 12.27c0-.79-.08-1.56-.21-2.27H12v4.51h6.69a5.7 5.7 0 01-2.48 3.74l3.99 3.27C22.63 19.69 23.89 16.18 23.89 12.27z"/>
    <path fill="#FBBC05" d="M5.27 14.24a7.08 7.08 0 010-4.48L1.34 5.84A12 12 0 000 12c0 1.92.45 3.74 1.34 5.36l3.93-3.12z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const AppleIconDark = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="#0D0D0F">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const GoogleIconDark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M5.27 9.76A7.08 7.08 0 0112 4.9c1.96 0 3.73.72 5.09 1.9l3.78-3.78A12 12 0 000 12c0 1.99.48 3.86 1.34 5.53l3.93-3.93a7 7 0 010-3.84z"/>
    <path fill="#34A853" d="M12 24a12 12 0 008.08-3.12l-3.99-3.27a7.08 7.08 0 01-4.09 1.3A7.1 7.1 0 015.18 14.3l-3.84 2.96A12 12 0 0012 24z"/>
    <path fill="#4A90E2" d="M23.89 12.27c0-.79-.08-1.56-.21-2.27H12v4.51h6.69a5.7 5.7 0 01-2.48 3.74l3.99 3.27C22.63 19.69 23.89 16.18 23.89 12.27z"/>
    <path fill="#FBBC05" d="M5.27 14.24a7.08 7.08 0 010-4.48L1.34 5.84A12 12 0 000 12c0 1.92.45 3.74 1.34 5.36l3.93-3.12z"/>
  </svg>
);

export default function AuthPage() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const { user, loading: sessionLoading, signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, offline } = useAuth();

  const { data: trendingData } = useTMDB(() => tmdb.trending('all', 'week'), []);
  const posters: TMDBItem[] = ((trendingData as any)?.results ?? []).filter((i: TMDBItem) => i.poster_path).slice(0, 21);
  const col1 = posters.filter((_, i) => i % 3 === 0);
  const col2 = posters.filter((_, i) => i % 3 === 1);
  const col3 = posters.filter((_, i) => i % 3 === 2);

  const [view,      setView]      = useState<'landing' | 'email'>('landing');
  const [mode,      setMode]      = useState<'login' | 'register'>('login');
  const [email,     setEmail]     = useState('');
  const [pass,      setPass]      = useState('');
  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (offline) {
      router.replace('/home');
      return;
    }
    if (user) {
      const done = localStorage.getItem('onboarding_done');
      router.replace(done ? '/home' : '/onboarding');
    }
  }, [offline, router, sessionLoading, user]);

  const clearError = () => setError('');

  const friendlyError = (code: string) => {
    const map: Record<string, string> = {
      'auth/user-not-found':          t('errors.userNotFound'),
      'auth/wrong-password':          t('errors.wrongPassword'),
      'auth/email-already-in-use':    t('errors.emailInUse'),
      'auth/weak-password':           t('errors.weakPassword'),
      'auth/invalid-email':           t('errors.invalidCredentials'),
      'auth/popup-closed-by-user':    t('errors.popupClosed'),
      'auth/cancelled-popup-request': t('errors.popupClosed'),
    };
    return map[code] ?? t('errors.generic');
  };

  const handleEmail = async () => {
    if (!email || !pass) { setError(t('errors.fillAll')); return; }
    setLoading(true); setError('');
    try {
      if (mode === 'login') await signInWithEmail(email, pass);
      else                  await registerWithEmail(name, email, pass);
    } catch (e: any) {
      setError(friendlyError(e?.code ?? ''));
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setLoading(true); setError('');
    try { await signInWithGoogle(); }
    catch (e: any) { setError(friendlyError(e?.code ?? '')); setLoading(false); }
  };

  const handleApple = async () => {
    setLoading(true); setError('');
    try { await signInWithApple(); }
    catch (e: any) { setError(friendlyError(e?.code ?? '')); setLoading(false); }
  };

  const handleReset = async () => {
    if (!email) { setError(t('errors.enterEmail')); return; }
    setLoading(true);
    try { await resetPassword(email); setResetSent(true); }
    catch { setError(t('errors.cantSendReset')); }
    finally { setLoading(false); }
  };

  if (offline || user) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    background: 'rgba(255,255,255,0.07)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
    color: 'rgba(255,255,255,0.92)', fontSize: 14,
    fontFamily: "'Area','Inter',sans-serif",
    outline: 'none', boxSizing: 'border-box',
    WebkitTextFillColor: 'rgba(255,255,255,0.92)',
  };

  const pillBtn = (primary: boolean): React.CSSProperties => ({
    width: '100%', padding: '15px 0', borderRadius: 50,
    background: primary ? 'rgba(255,255,255,0.93)' : 'rgba(255,255,255,0.07)',
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
    color: primary ? '#0D0D0F' : 'rgba(255,255,255,0.75)',
    fontSize: 15, fontWeight: 700,
    fontFamily: "'Area','Inter',sans-serif",
    cursor: loading ? 'default' : 'pointer',
    opacity: loading && primary ? 0.6 : 1,
    letterSpacing: '-0.1px',
  });

  /* ─────────────────────────── LANDING VIEW ─────────────────────────── */
  if (view === 'landing') {
    return (
      <Frame>
        <Screen style={{ background: '#0D0D0F', flexDirection: 'column' } as React.CSSProperties}>
          <style>{ANIM_CSS}</style>

          {/* ── Hero: poster columns ── */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0D0D0F' }}>

            {/* Scrolling posters */}
            {posters.length > 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, padding: '0 8px', opacity: 0.42, zIndex: 0 }}>
                <PosterCol items={col1} animClass="poster-col-up" />
                <PosterCol items={col2} animClass="poster-col-down" />
                <PosterCol items={col3} animClass="poster-col-up" />
              </div>
            )}

            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to bottom, #0D0D0F 0%, rgba(13,13,15,0.2) 30%, rgba(13,13,15,0.2) 60%, #0D0D0F 90%)' }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(13,13,15,0.28)' }} />

            {/* Logo */}
            <div style={{ position: 'absolute', top: 'max(58px, calc(var(--safe-area-top) + 12px))', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
              <Logo height={22} />
            </div>
          </div>

          {/* ── Bottom sheet ── */}
          <div style={{ background: '#161619', borderRadius: '36px 36px 0 0', marginTop: -36, zIndex: 10, position: 'relative', boxShadow: '0 -2px 40px rgba(0,0,0,0.6)', paddingBottom: 'calc(var(--safe-area-bottom) + 36px)' }}>

            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.14)' }} />
            </div>

            <div style={{ padding: '14px 24px 0' }}>

              {/* Title + subtitle */}
              <div style={{ fontSize: 24, fontWeight: 900, color: 'rgba(255,255,255,0.93)', fontFamily: "'Area','Inter',sans-serif", letterSpacing: '-0.5px', marginBottom: 6 }}>
                {t('landing.title')}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', fontFamily: "'Area','Inter',sans-serif", lineHeight: 1.5, marginBottom: 26 }}>
                {t('landing.subtitle')}
              </div>

              {/* CTA: email */}
              <button
                onClick={() => { setView('email'); setMode('register'); }}
                style={{ ...pillBtn(true), marginBottom: 10, display: 'block' }}
              >
                {t('landing.continueEmail')}
              </button>

              {/* CTA: already have account */}
              <button
                onClick={() => { setView('email'); setMode('login'); }}
                style={{ ...pillBtn(false), marginBottom: 18, display: 'block' }}
              >
                {t('landing.alreadyHaveAccount')}
              </button>

              {/* Social row */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleApple} disabled={loading} style={{ flex: 1, padding: '13px 0', borderRadius: 50, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
                  <AppleIconDark />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0F', fontFamily: "'Area','Inter',sans-serif" }}>Apple</span>
                </button>
                <button onClick={handleGoogle} disabled={loading} style={{ flex: 1, padding: '13px 0', borderRadius: 50, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
                  <GoogleIconDark />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0F', fontFamily: "'Area','Inter',sans-serif" }}>Google</span>
                </button>
              </div>

              {error && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <span style={{ fontSize: 12, color: '#F87171', fontFamily: "'Area','Inter',sans-serif" }}>{error}</span>
                </div>
              )}
            </div>
          </div>
        </Screen>
      </Frame>
    );
  }

  /* ─────────────────────────── EMAIL FORM VIEW ─────────────────────────── */
  return (
    <Frame>
      <Screen style={{ background: '#0D0D0F' }}>
        <style>{ANIM_CSS}</style>

        {/* Compact hero */}
        <div style={{ height: 160, flexShrink: 0, position: 'relative', overflow: 'hidden', background: '#0D0D0F' }}>
          {posters.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, padding: '0 8px', opacity: 0.38, zIndex: 0 }}>
              <PosterCol items={col1} animClass="poster-col-up" />
              <PosterCol items={col2} animClass="poster-col-down" />
              <PosterCol items={col3} animClass="poster-col-up" />
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to bottom, #0D0D0F 0%, rgba(13,13,15,0.15) 40%, #0D0D0F 100%)' }} />
          {/* Back button */}
          <button
            onClick={() => { setView('landing'); clearError(); setError(''); }}
            style={{ position: 'absolute', top: 'calc(var(--safe-area-top) + 12px)', left: 20, width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}
          >
            <Icon name="chevronL" size={16} color="rgba(255,255,255,0.8)" />
          </button>
          <div style={{ position: 'absolute', top: 'calc(var(--safe-area-top) + 12px)', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', height: 34, zIndex: 2 }}>
            <Logo height={20} />
          </div>
        </div>

        {/* Form sheet */}
        <div style={{ flex: 1, background: '#161619', borderRadius: '36px 36px 0 0', marginTop: -36, zIndex: 10, position: 'relative', overflowY: 'auto', boxShadow: '0 -2px 40px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.14)' }} />
          </div>

          <div style={{ padding: '16px 24px calc(var(--safe-area-bottom) + 40px)' }}>

            {/* Tab switcher */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, marginBottom: 22, border: '1px solid rgba(255,255,255,0.09)' }}>
              {(['login', 'register'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); clearError(); }}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 11, background: mode === m ? 'rgba(255,255,255,0.12)' : 'transparent', border: mode === m ? '1px solid rgba(255,255,255,0.22)' : '1px solid transparent', color: mode === m ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 700, fontFamily: "'Area','Inter',sans-serif", cursor: 'pointer', transition: 'all 0.2s' }}>
                  {m === 'login' ? t('loginTab') : t('registerTabShort')}
                </button>
              ))}
            </div>

            {/* Name (register) */}
            {mode === 'register' && (
              <div style={{ marginBottom: 10 }}>
                <input style={inputStyle} placeholder={t('namePlaceholder')} value={name} onChange={e => { setName(e.target.value); clearError(); }} />
              </div>
            )}

            {/* Email */}
            <div style={{ marginBottom: 10 }}>
              <input style={inputStyle} placeholder={t('email')} type="email" value={email} onChange={e => { setEmail(e.target.value); clearError(); }} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: error ? 8 : 18 }}>
              <input style={inputStyle} placeholder={t('password')} type="password" value={pass} onChange={e => { setPass(e.target.value); clearError(); }} onKeyDown={e => e.key === 'Enter' && handleEmail()} />
            </div>

            {/* Error */}
            {error && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span style={{ fontSize: 12, color: '#F87171', fontFamily: "'Area','Inter',sans-serif" }}>{error}</span>
              </div>
            )}

            {resetSent && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}>
                <span style={{ fontSize: 12, color: '#4ade80', fontFamily: "'Area','Inter',sans-serif" }}>{t('errors.resetSent')}</span>
              </div>
            )}

            {/* Primary CTA */}
            <button onClick={handleEmail} disabled={loading}
              style={{ ...pillBtn(true), display: 'block', marginBottom: 14 }}>
              {loading ? t('loading') : (mode === 'login' ? t('loginButton') : t('registerButton'))}
            </button>

            {/* Forgot password */}
            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <button onClick={handleReset} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', fontFamily: "'Area','Inter',sans-serif" }}>{t('forgotPassword')}</span>
                </button>
              </div>
            )}

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: "'Area','Inter',sans-serif" }}>{t('or', { ns: 'common' })}</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.09)' }} />
            </div>

            {/* Social buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleApple} disabled={loading} style={{ flex: 1, padding: '13px 0', borderRadius: 50, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
                <AppleIconDark />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0F', fontFamily: "'Area','Inter',sans-serif" }}>Apple</span>
              </button>
              <button onClick={handleGoogle} disabled={loading} style={{ flex: 1, padding: '13px 0', borderRadius: 50, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' }}>
                <GoogleIconDark />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0F', fontFamily: "'Area','Inter',sans-serif" }}>Google</span>
              </button>
            </div>
          </div>
        </div>
      </Screen>
    </Frame>
  );
}
