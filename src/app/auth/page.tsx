'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';

export default function AuthPage() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, signInWithEmail, registerWithEmail, resetPassword, offline } = useAuth();

  const [mode,      setMode]      = useState<'login' | 'register'>('login');
  const [email,     setEmail]     = useState('');
  const [pass,      setPass]      = useState('');
  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resetSent, setResetSent] = useState(false);

  const clearError = () => setError('');

  const friendlyError = (code: string) => {
    const map: Record<string, string> = {
      'auth/user-not-found':          'E-mail não encontrado',
      'auth/wrong-password':          'Senha incorreta',
      'auth/email-already-in-use':    'E-mail já cadastrado',
      'auth/weak-password':           'A senha precisa ter pelo menos 6 caracteres',
      'auth/invalid-email':           'E-mail inválido',
      'auth/popup-closed-by-user':    'Login cancelado',
      'auth/cancelled-popup-request': 'Login cancelado',
    };
    return map[code] ?? 'Ocorreu um erro. Tente novamente.';
  };

  const handleEmail = async () => {
    if (!email || !pass) { setError('Preencha todos os campos'); return; }
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
    if (!email) { setError('Digite seu e-mail acima'); return; }
    setLoading(true);
    try { await resetPassword(email); setResetSent(true); }
    catch { setError('Não foi possível enviar o e-mail de redefinição'); }
    finally { setLoading(false); }
  };

  /* Offline mode — go straight to home */
  if (offline) {
    router.replace('/home');
    return null;
  }

  /* ── Dark skin tokens ── */
  const DK = {
    bg:        '#0D0D0F',
    card:      'rgba(255,255,255,0.07)',
    border:    'rgba(255,255,255,0.12)',
    t1:        'rgba(255,255,255,0.92)',
    t2:        'rgba(255,255,255,0.55)',
    t3:        'rgba(255,255,255,0.30)',
    accent:    '#C069FF',
    accentDim: 'rgba(192,105,255,0.20)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    background: DK.card,
    border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : DK.border}`,
    color: DK.t1, fontSize: 14, fontFamily: "'Area','Inter',sans-serif",
    outline: 'none', boxSizing: 'border-box',
    WebkitTextFillColor: DK.t1,
  };

  const glassBtn: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '13px 0', borderRadius: 12,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.13)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
    cursor: loading ? 'default' : 'pointer',
    fontFamily: "'Area','Inter',sans-serif",
    color: DK.t1, fontSize: 13, fontWeight: 600,
    opacity: loading ? 0.5 : 1,
  };

  const SocialBtn = ({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} disabled={loading} style={glassBtn}>
      {icon}{label}
    </button>
  );

  return (
    <Frame>
      <Screen style={{ background: DK.bg }}>
        {/* Header area */}
        <div style={{
          height: 180, flexShrink: 0,
          background: `linear-gradient(to bottom, rgba(192,105,255,0.12), ${DK.bg})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10,
        }}>
          {/* Back button */}
          <div style={{ position: 'absolute', top: 56, left: 20 }}>
            <button
              onClick={() => router.push('/welcome')}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: 'rgba(255,255,255,0.09)',
                border: '1px solid rgba(255,255,255,0.14)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="chevronL" size={17} color="rgba(255,255,255,0.8)" />
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Maratonou" style={{ height: 26, width: 'auto', display: 'block', marginBottom: 4 }} />
          <div style={{ fontSize: 13, color: DK.t3, fontFamily: "'Area','Inter',sans-serif" }}>
            {mode === 'login' ? 'Bem-vindo de volta 👋' : 'Crie sua conta gratuitamente'}
          </div>
        </div>

        <ScrollArea style={{ padding: '0 24px' }}>
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.05)',
            borderRadius: 12, padding: 4, marginBottom: 24,
            border: `1px solid ${DK.border}`,
          }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearError(); }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 9,
                  background: mode === m ? DK.accentDim : 'transparent',
                  border: mode === m ? `1px solid rgba(192,105,255,0.35)` : '1px solid transparent',
                  color: mode === m ? DK.accent : DK.t3,
                  fontSize: 13, fontWeight: 700,
                  fontFamily: "'Area','Inter',sans-serif",
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {m === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>

          {/* Social buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <SocialBtn label="Google" onClick={handleGoogle} icon={
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0112 4.9c1.96 0 3.73.72 5.09 1.9l3.78-3.78A12 12 0 000 12c0 1.99.48 3.86 1.34 5.53l3.93-3.93a7 7 0 010-3.84z"/>
                <path fill="#34A853" d="M12 24a12 12 0 008.08-3.12l-3.99-3.27a7.08 7.08 0 01-4.09 1.3A7.1 7.1 0 015.18 14.3l-3.84 2.96A12 12 0 0012 24z"/>
                <path fill="#4A90E2" d="M23.89 12.27c0-.79-.08-1.56-.21-2.27H12v4.51h6.69a5.7 5.7 0 01-2.48 3.74l3.99 3.27C22.63 19.69 23.89 16.18 23.89 12.27z"/>
                <path fill="#FBBC05" d="M5.27 14.24a7.08 7.08 0 010-4.48L1.34 5.84A12 12 0 000 12c0 1.92.45 3.74 1.34 5.36l3.93-3.12z"/>
              </svg>
            } />
            <SocialBtn label="Apple" onClick={handleApple} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            } />
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: DK.border }} />
            <span style={{ fontSize: 12, color: DK.t3, fontFamily: "'Area','Inter',sans-serif" }}>ou continue com e-mail</span>
            <div style={{ flex: 1, height: 1, background: DK.border }} />
          </div>

          {/* Form fields */}
          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <input
                style={inputStyle}
                placeholder="Seu nome"
                value={name}
                onChange={(e) => { setName(e.target.value); clearError(); }}
              />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <input
              style={inputStyle}
              placeholder="E-mail"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
            />
          </div>
          <div style={{ marginBottom: error ? 8 : 20 }}>
            <input
              style={inputStyle}
              placeholder="Senha"
              type="password"
              value={pass}
              onChange={(e) => { setPass(e.target.value); clearError(); }}
              onKeyDown={(e) => e.key === 'Enter' && handleEmail()}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <span style={{ fontSize: 12, color: '#F87171', fontFamily: "'Area','Inter',sans-serif" }}>{error}</span>
            </div>
          )}

          {/* Reset sent */}
          {resetSent && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}>
              <span style={{ fontSize: 12, color: '#4ade80', fontFamily: "'Area','Inter',sans-serif" }}>E-mail de redefinição enviado ✓</span>
            </div>
          )}

          {/* Primary CTA */}
          <button
            onClick={handleEmail}
            disabled={loading}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 50,
              background: loading ? 'rgba(192,105,255,0.5)' : 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,1)',
              color: loading ? 'rgba(255,255,255,0.7)' : '#0D0D0F',
              fontSize: 15, fontWeight: 700,
              fontFamily: "'Area','Inter',sans-serif",
              cursor: loading ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Aguarde...' : (mode === 'login' ? 'Entrar' : 'Criar conta')}
          </button>

          {/* Forgot password */}
          {mode === 'login' && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                onClick={handleReset}
                disabled={loading}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12, color: DK.t2, fontFamily: "'Area','Inter',sans-serif" }}>Esqueceu a senha?</span>
              </button>
            </div>
          )}

          {/* Switch mode */}
          <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 48 }}>
            <span style={{ fontSize: 12, color: DK.t3, fontFamily: "'Area','Inter',sans-serif" }}>
              {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            </span>
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); clearError(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12, color: '#C069FF', fontWeight: 700, fontFamily: "'Area','Inter',sans-serif" }}>
                {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
              </span>
            </button>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
