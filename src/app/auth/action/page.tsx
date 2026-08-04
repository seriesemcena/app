'use client';
/* ─────────────────────────────────────────────────────────────
   /auth/action — Maratonou's own Firebase Auth action handler.

   Set as the action URL on every Firebase e-mail template. Reads
   mode / oobCode / continueUrl / lang / apiKey from the URL and runs
   verifyEmail, resetPassword or recoverEmail against the app's
   EXISTING Firebase project (the apiKey in the URL is intentionally
   ignored — never used to init a different project).

   Security: the oobCode is never logged nor sent anywhere; continueUrl
   is validated against a strict allowlist (no open redirects); URL
   parameters are never injected into the DOM; Firebase errors are
   surfaced as friendly states without leaking internals. Works without
   an authenticated session, in browser, PWA, iOS and Android.
   ───────────────────────────────────────────────────────────── */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/lib/tokens';
import { firebaseConfigured, getFirebaseAuth } from '@/lib/firebase';
import { resolveSafeContinueUrl, actionResultKey } from '@/lib/authActionUrl';

type Tone = 'success' | 'error' | 'warn' | 'neutral';
type Status =
  | 'loading'
  | 'verify-success'
  | 'reset-form'
  | 'reset-success'
  | 'recover-success'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'missing-code'
  | 'unknown-mode'
  | 'connection'
  | 'error';

const MIN_PASSWORD = 8;

/* Presentation (icon / tone / copy) for the terminal, non-form states.
   Copy is Brazilian Portuguese and never echoes URL parameters. */
const VIEWS: Record<Exclude<Status, 'loading' | 'reset-form'>, { icon: IconName; tone: Tone; title: string; message: string }> = {
  'verify-success': {
    icon: 'check', tone: 'success',
    title: 'E-mail confirmado!',
    message: 'Seu endereço de e-mail foi verificado com sucesso. Sua conta está pronta para uso.',
  },
  'reset-success': {
    icon: 'check', tone: 'success',
    title: 'Senha redefinida!',
    message: 'Sua senha foi alterada com sucesso. Agora é só entrar com a nova senha.',
  },
  'recover-success': {
    icon: 'check', tone: 'success',
    title: 'Endereço recuperado',
    message: 'Revertemos a alteração e seu e-mail de acesso voltou ao endereço anterior.',
  },
  invalid: {
    icon: 'close', tone: 'error',
    title: 'Link inválido',
    message: 'Este link não é válido ou já foi utilizado. Solicite um novo e-mail e tente de novo.',
  },
  expired: {
    icon: 'clock', tone: 'warn',
    title: 'Link expirado',
    message: 'Este link expirou por segurança. Solicite um novo e-mail para continuar.',
  },
  used: {
    icon: 'info', tone: 'warn',
    title: 'Link já utilizado',
    message: 'Este link já foi usado. Se ainda precisar, solicite um novo por e-mail.',
  },
  'missing-code': {
    icon: 'info', tone: 'error',
    title: 'Link incompleto',
    message: 'Não encontramos o código de ação neste link. Abra o e-mail mais recente que enviamos.',
  },
  'unknown-mode': {
    icon: 'info', tone: 'warn',
    title: 'Ação não reconhecida',
    message: 'Não conseguimos identificar o que este link deveria fazer. Use o link mais recente enviado por e-mail.',
  },
  connection: {
    icon: 'wifi', tone: 'error',
    title: 'Falha de conexão',
    message: 'Não foi possível concluir. Verifique sua internet e tente novamente.',
  },
  error: {
    icon: 'close', tone: 'error',
    title: 'Algo deu errado',
    message: 'Ocorreu um erro inesperado ao processar seu link. Tente novamente em instantes.',
  },
};

const TONE_COLOR: Record<Tone, string> = {
  success: '#3ECF8E',
  error: '#F87171',
  warn: '#FBBF24',
  neutral: '#C069FF',
};

function errorToStatus(err: unknown): Status {
  const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: string }).code) : '';
  switch (code) {
    case 'auth/expired-action-code': return 'expired';
    case 'auth/invalid-action-code': return 'invalid';
    case 'auth/user-disabled':
    case 'auth/user-not-found': return 'invalid';
    case 'auth/network-request-failed': return 'connection';
    default: return 'error';
  }
}

const STYLES = `
  .aa-screen {
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    background: var(--c-bg);
    color: var(--c-t1);
    font-family: 'Area','Inter',sans-serif;
    padding:
      calc(var(--safe-area-top) + 28px)
      calc(var(--safe-area-right) + 20px)
      calc(var(--safe-area-bottom) + 28px)
      calc(var(--safe-area-left) + 20px);
    overflow-y: auto;
  }
  .aa-card {
    width: 100%;
    max-width: 380px;
    box-sizing: border-box;
    background: var(--c-card);
    border: 1px solid var(--c-border);
    border-radius: 22px;
    padding: 30px 24px 26px;
    box-shadow: 0 14px 40px rgba(0,0,0,0.18);
    text-align: center;
  }
  .aa-badge {
    width: 66px; height: 66px; border-radius: 33px;
    margin: 2px auto 18px;
    display: flex; align-items: center; justify-content: center;
  }
  .aa-title { font-size: 20px; font-weight: 800; line-height: 1.25; margin: 0 0 8px; color: var(--c-t1); }
  .aa-msg { font-size: 14px; line-height: 1.55; color: var(--c-t2); margin: 0; }
  .aa-note {
    margin-top: 14px; padding: 11px 13px; border-radius: 12px;
    background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.28);
    font-size: 12.5px; line-height: 1.5; color: var(--c-t2); text-align: left;
  }
  .aa-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
  .aa-form { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; text-align: left; }
  .aa-field { display: flex; flex-direction: column; gap: 6px; }
  .aa-label { font-size: 12.5px; font-weight: 600; color: var(--c-t2); }
  .aa-input {
    width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 13px;
    background: var(--c-surface, rgba(127,127,127,0.08));
    border: 1px solid var(--c-border);
    color: var(--c-t1); font-size: 14px; font-family: inherit; outline: none;
    -webkit-text-fill-color: currentColor;
  }
  .aa-input:focus-visible { border-color: #C069FF; box-shadow: 0 0 0 3px rgba(192,105,255,0.28); }
  .aa-input[aria-invalid="true"] { border-color: #F87171; }
  .aa-hint { font-size: 11.5px; color: var(--c-t3); }
  .aa-err {
    font-size: 12.5px; color: #F87171; margin: 2px 0 0; font-weight: 600;
  }
  .aa-btn {
    width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 40px;
    font-size: 14.5px; font-weight: 700; font-family: inherit; cursor: pointer;
    border: 1px solid transparent; letter-spacing: -0.1px;
    transition: opacity 0.15s ease, transform 0.08s ease;
  }
  .aa-btn:active { transform: scale(0.985); }
  .aa-btn:disabled { opacity: 0.55; cursor: default; }
  .aa-btn-primary { background: #C069FF; color: #fff; }
  .aa-btn-secondary { background: transparent; color: var(--c-t1); border-color: var(--c-border); }
  .aa-btn:focus-visible { outline: 2px solid #C069FF; outline-offset: 3px; }
  .aa-ok { font-size: 12.5px; color: #3ECF8E; font-weight: 600; margin-top: 4px; }
  .aa-spinner {
    width: 30px; height: 30px; border-radius: 50%;
    border: 3px solid var(--c-border); border-top-color: #C069FF;
    animation: aa-spin 0.8s linear infinite;
  }
  @keyframes aa-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .aa-spinner { animation-duration: 2.4s; }
    .aa-btn:active { transform: none; }
  }
`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="aa-screen">
      <style>{STYLES}</style>
      <Logo height={26} />
      {children}
    </div>
  );
}

function Badge({ icon, tone }: { icon: IconName; tone: Tone }) {
  const color = TONE_COLOR[tone];
  return (
    <div className="aa-badge" style={{ background: `${color}22` }} aria-hidden="true">
      <Icon name={icon} size={30} color={color} />
    </div>
  );
}

function AuthActionInner() {
  const params = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Kept in refs so the oobCode is never rendered into the DOM and the initial
  // processing runs exactly once (StrictMode-safe).
  const codeRef = useRef('');
  const modeRef = useRef('');
  const continueRef = useRef<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Read every documented parameter. apiKey is intentionally IGNORED (we never
    // re-init Firebase from it — only the app's validated config is used). lang
    // is reserved; the copy is Brazilian Portuguese for now.
    const mode = params.get('mode') ?? '';
    const oobCode = params.get('oobCode') ?? '';
    continueRef.current = resolveSafeContinueUrl(params.get('continueUrl'));
    void params.get('lang');
    void params.get('apiKey');
    modeRef.current = mode;
    codeRef.current = oobCode;

    // Link-shape checks first (they depend only on the URL), so a bare or
    // malformed link always shows a safe message — even where Firebase env is
    // absent — instead of a generic error.
    if (!oobCode) { setStatus('missing-code'); return; }
    if (mode !== 'verifyEmail' && mode !== 'resetPassword' && mode !== 'recoverEmail') {
      setStatus('unknown-mode');
      return;
    }
    if (!firebaseConfigured) { setStatus('error'); return; }

    // Restore a completed result on refresh without re-calling Firebase (which
    // would otherwise report the now-consumed code as invalid). Local only.
    try {
      const cached = sessionStorage.getItem(actionResultKey(mode, oobCode));
      if (cached) {
        const parsed = JSON.parse(cached) as { status: Status; email?: string };
        if (parsed?.status) {
          setStatus(parsed.status);
          if (parsed.email) setEmail(parsed.email);
          return;
        }
      }
    } catch { /* ignore cache read issues */ }

    let cancelled = false;
    (async () => {
      try {
        const auth = getFirebaseAuth();
        const fb = await import('firebase/auth');

        if (mode === 'verifyEmail') {
          await fb.applyActionCode(auth, oobCode);
          // Refresh the signed-in user (if any) so emailVerified flips locally.
          try { if (auth.currentUser) await auth.currentUser.reload(); } catch { /* no session is fine */ }
          if (cancelled) return;
          cacheResult(mode, oobCode, 'verify-success');
          setStatus('verify-success');
        } else if (mode === 'resetPassword') {
          const addr = await fb.verifyPasswordResetCode(auth, oobCode);
          if (cancelled) return;
          setEmail(addr);
          setStatus('reset-form');
        } else {
          // recoverEmail — read the address being restored, then revert.
          const info = await fb.checkActionCode(auth, oobCode);
          const restored = info?.data?.email ?? '';
          await fb.applyActionCode(auth, oobCode);
          if (cancelled) return;
          setEmail(restored);
          cacheResult(mode, oobCode, 'recover-success', restored);
          setStatus('recover-success');
        }
      } catch (err) {
        if (!cancelled) setStatus(errorToStatus(err));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cacheResult(mode: string, code: string, s: Status, addr?: string) {
    try {
      sessionStorage.setItem(actionResultKey(mode, code), JSON.stringify({ status: s, email: addr }));
    } catch { /* storage may be unavailable — non-fatal */ }
  }

  const goHome = () => { router.push('/home'); };
  const goLogin = () => { router.push('/auth'); };

  const onContinue = () => {
    const target = continueRef.current;
    if (target) { window.location.assign(target); return; }
    // No valid continueUrl → fixed internal default (never an open redirect).
    goHome();
  };

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPass.length < MIN_PASSWORD) {
      setFormError(`A nova senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (newPass !== confirmPass) {
      setFormError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const auth = getFirebaseAuth();
      const fb = await import('firebase/auth');
      await fb.confirmPasswordReset(auth, codeRef.current, newPass);
      cacheResult(modeRef.current, codeRef.current, 'reset-success');
      setStatus('reset-success');
    } catch (err) {
      const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: string }).code) : '';
      if (code === 'auth/weak-password') {
        setFormError('Senha muito fraca. Escolha uma senha mais forte.');
      } else {
        setStatus(errorToStatus(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function requestReset() {
    if (!email) return;
    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const fb = await import('firebase/auth');
      await fb.sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch { /* keep the screen; the user can retry */ }
    finally { setSubmitting(false); }
  }

  /* ── Loading / validating ── */
  if (status === 'loading') {
    return (
      <Shell>
        <div className="aa-card" role="status" aria-live="polite">
          <div className="aa-badge" aria-hidden="true"><div className="aa-spinner" /></div>
          <h1 className="aa-title">Validando seu link</h1>
          <p className="aa-msg">Aguarde um instante enquanto confirmamos com segurança.</p>
        </div>
      </Shell>
    );
  }

  /* ── Reset password form ── */
  if (status === 'reset-form') {
    const pwdInvalid = !!formError && newPass.length < MIN_PASSWORD;
    const matchInvalid = !!formError && newPass.length >= MIN_PASSWORD && newPass !== confirmPass;
    return (
      <Shell>
        <div className="aa-card">
          <Badge icon="lock" tone="neutral" />
          <h1 className="aa-title">Criar nova senha</h1>
          <p className="aa-msg">
            {email ? <>Defina uma nova senha para <strong>{email}</strong>.</> : 'Defina uma nova senha para sua conta.'}
          </p>
          <form className="aa-form" onSubmit={submitReset} noValidate>
            <div className="aa-field">
              <label className="aa-label" htmlFor="aa-newpass">Nova senha</label>
              <input
                id="aa-newpass" className="aa-input" type="password" autoComplete="new-password"
                value={newPass} onChange={(e) => { setNewPass(e.target.value); setFormError(''); }}
                aria-invalid={pwdInvalid} aria-describedby="aa-pass-hint aa-form-err"
                autoFocus
              />
              <span id="aa-pass-hint" className="aa-hint">Mínimo de {MIN_PASSWORD} caracteres.</span>
            </div>
            <div className="aa-field">
              <label className="aa-label" htmlFor="aa-confirm">Confirmar nova senha</label>
              <input
                id="aa-confirm" className="aa-input" type="password" autoComplete="new-password"
                value={confirmPass} onChange={(e) => { setConfirmPass(e.target.value); setFormError(''); }}
                aria-invalid={matchInvalid} aria-describedby="aa-form-err"
              />
            </div>
            {formError && <p id="aa-form-err" className="aa-err" role="alert">{formError}</p>}
            <div className="aa-actions">
              <button className="aa-btn aa-btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Redefinindo…' : 'Redefinir senha'}
              </button>
            </div>
          </form>
        </div>
      </Shell>
    );
  }

  /* ── Terminal states ── */
  const view = VIEWS[status];
  const isError = view.tone === 'error' || view.tone === 'warn';

  return (
    <Shell>
      <div className="aa-card" role={isError ? 'alert' : 'status'} aria-live="polite">
        <Badge icon={view.icon} tone={view.tone} />
        <h1 className="aa-title">{view.title}</h1>
        <p className="aa-msg">
          {status === 'recover-success' && email
            ? <>Revertemos a alteração e seu e-mail de acesso voltou a ser <strong>{email}</strong>.</>
            : view.message}
        </p>

        {status === 'recover-success' && (
          <p className="aa-note">
            Por segurança, recomendamos redefinir sua senha. Se você não solicitou essa mudança,
            outra pessoa pode ter tentado acessar sua conta.
          </p>
        )}

        <div className="aa-actions">
          {status === 'verify-success' && (
            <button className="aa-btn aa-btn-primary" onClick={onContinue}>Continuar no Maratonou</button>
          )}

          {status === 'reset-success' && (
            <button className="aa-btn aa-btn-primary" onClick={goLogin}>Entrar no Maratonou</button>
          )}

          {status === 'recover-success' && (
            <>
              <button className="aa-btn aa-btn-primary" onClick={requestReset} disabled={submitting || resetSent}>
                {resetSent ? 'E-mail de redefinição enviado' : (submitting ? 'Enviando…' : 'Redefinir senha')}
              </button>
              {resetSent && <span className="aa-ok" role="status">Verifique sua caixa de entrada ✓</span>}
              <button className="aa-btn aa-btn-secondary" onClick={goHome}>Ir para o Maratonou</button>
            </>
          )}

          {status === 'connection' && (
            <button className="aa-btn aa-btn-primary" onClick={() => window.location.reload()}>Tentar novamente</button>
          )}

          {(status === 'invalid' || status === 'expired' || status === 'used'
            || status === 'missing-code' || status === 'unknown-mode' || status === 'error'
            || status === 'connection') && (
            <button className="aa-btn aa-btn-secondary" onClick={goHome}>Ir para o Maratonou</button>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="aa-screen">
          <style>{STYLES}</style>
          <Logo height={26} />
          <div className="aa-card" role="status" aria-live="polite">
            <div className="aa-badge" aria-hidden="true"><div className="aa-spinner" /></div>
            <h1 className="aa-title">Carregando…</h1>
          </div>
        </div>
      }
    >
      <AuthActionInner />
    </Suspense>
  );
}
