'use client';
/* ─────────────────────────────────────────────────────────────
   AuthGateSheet — pede login (e e-mail confirmado) antes de ações
   que exigem conta.

   Visitantes navegam livremente pelo catálogo, mas comentar,
   avaliar, reagir, curtir ou salvar em listas exige conta. Em vez
   de empurrar direto para /auth (perdendo o contexto sem aviso),
   abre uma folha explicando a ação e oferecendo Entrar/Criar conta.

   Contas recém-criadas por e-mail/senha começam sem o e-mail
   confirmado. Para elas a mesma folha vira um pedido de confirmação
   (reenviar link / "já confirmei"), travando ações de escrita até a
   verificação. Logins Google/Apple já vêm verificados pelo provedor.

   Uso:
     const { requireAuth, authGate } = useAuthGate();
     <button onClick={() => requireAuth('comment', enviarComentario)} />
     {authGate}
   ───────────────────────────────────────────────────────────── */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { BottomSheet, Txt, Btn } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useAuthContext } from '@/context/AuthContext';

/** Ação bloqueada — define a frase mostrada ao visitante. */
export type AuthGateReason =
  | 'comment' | 'reply' | 'rate' | 'react' | 'like' | 'list' | 'watch' | 'favorite' | 'report';

const ICON: Record<AuthGateReason, 'message' | 'star' | 'heart' | 'bookmark' | 'check' | 'flag'> = {
  comment: 'message', reply: 'message', rate: 'star', react: 'heart',
  like: 'heart', list: 'bookmark', watch: 'check', favorite: 'heart', report: 'flag',
};

export function useAuthGate() {
  const { user, resendVerification } = useAuth();
  const { emailVerified, refreshUser } = useAuthContext();
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [reason, setReason] = useState<AuthGateReason | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Action held back while the e-mail is unconfirmed, replayed once verified.
  const pendingRef = useRef<(() => void) | null>(null);

  /** Abre a folha de login. Para quem já tem um early return por conta própria. */
  const promptSignIn = useCallback((next: AuthGateReason) => setReason(next), []);

  /** Executa `action` quando há sessão verificada; caso contrário abre a folha
      de login (visitante) ou de confirmação de e-mail (conta não verificada). */
  const requireAuth = useCallback((next: AuthGateReason, action: () => void) => {
    if (!user) { setReason(next); return; }
    if (!emailVerified) { pendingRef.current = action; setResent(false); setVerifyOpen(true); return; }
    action();
  }, [user, emailVerified]);

  const closeSignIn = () => setReason(null);
  const closeVerify = () => { setVerifyOpen(false); setResent(false); pendingRef.current = null; };
  const go = (mode: 'login' | 'register') => {
    setReason(null);
    router.push(mode === 'register' ? '/auth?mode=register' : '/auth');
  };

  const resend = async () => {
    setBusy(true);
    try { await resendVerification(); setResent(true); }
    catch { /* silencioso: o usuário pode tentar de novo */ }
    finally { setBusy(false); }
  };

  const confirmVerified = async () => {
    setBusy(true);
    try {
      const ok = await refreshUser();
      if (ok) {
        const act = pendingRef.current;
        pendingRef.current = null;
        setVerifyOpen(false);
        setResent(false);
        act?.();
      }
    } finally { setBusy(false); }
  };

  const authGate = (
    <>
      {/* Folha de login — visitante sem conta */}
      <BottomSheet visible={reason !== null} onClose={closeSignIn} title={t('gate.title')}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '4px 0 8px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, flexShrink: 0,
            background: 'rgba(192,105,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={reason ? ICON[reason] : 'user'} size={26} color={T.pink} />
          </div>

          <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', textAlign: 'center' }}>
            {reason ? t(`gate.reason.${reason}`) : ''}
          </Txt>
          <Txt size={13} color={T.t3} style={{ display: 'block', textAlign: 'center', lineHeight: 1.5 }}>
            {t('gate.subtitle')}
          </Txt>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 4 }}>
            <Btn label={t('gate.createAccount')} variant="pink" full onClick={() => go('register')} />
            <Btn label={t('gate.signIn')} variant="secondary" full onClick={() => go('login')} />
          </div>
        </div>
      </BottomSheet>

      {/* Folha de confirmação — conta logada mas com e-mail não verificado */}
      <BottomSheet visible={verifyOpen} onClose={closeVerify} title={t('gate.verify.title')}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '4px 0 8px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28, flexShrink: 0,
            background: 'rgba(192,105,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="lock" size={24} color={T.pink} />
          </div>

          {user?.email && (
            <Txt size={15} weight={700} color={T.t1} style={{ display: 'block', textAlign: 'center', wordBreak: 'break-all' }}>
              {user.email}
            </Txt>
          )}
          <Txt size={13} color={T.t3} style={{ display: 'block', textAlign: 'center', lineHeight: 1.5 }}>
            {t('gate.verify.message')}
          </Txt>
          {resent && (
            <Txt size={12} weight={700} color="#4ade80" style={{ display: 'block', textAlign: 'center' }}>
              {t('gate.verify.resent')}
            </Txt>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 4 }}>
            <Btn label={t('gate.verify.confirmed')} variant="pink" full onClick={confirmVerified} disabled={busy} />
            <Btn label={t('gate.verify.resend')} variant="secondary" full onClick={resend} disabled={busy} />
          </div>
        </div>
      </BottomSheet>
    </>
  );

  return { requireAuth, promptSignIn, authGate, isSignedIn: !!user, emailVerified };
}
