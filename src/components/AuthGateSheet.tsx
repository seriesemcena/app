'use client';
/* ─────────────────────────────────────────────────────────────
   AuthGateSheet — pede login antes de ações que exigem conta.

   Visitantes navegam livremente pelo catálogo, mas comentar,
   avaliar, reagir, curtir ou salvar em listas exige conta. Em vez
   de empurrar direto para /auth (perdendo o contexto sem aviso),
   abre uma folha explicando a ação e oferecendo Entrar/Criar conta.

   Uso:
     const { requireAuth, authGate } = useAuthGate();
     <button onClick={() => requireAuth('comment', enviarComentario)} />
     {authGate}
   ───────────────────────────────────────────────────────────── */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { BottomSheet, Txt, Btn } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useAuth } from '@/hooks/useAuth';

/** Ação bloqueada — define a frase mostrada ao visitante. */
export type AuthGateReason =
  | 'comment' | 'reply' | 'rate' | 'react' | 'like' | 'list' | 'watch' | 'favorite' | 'report';

const ICON: Record<AuthGateReason, 'message' | 'star' | 'heart' | 'bookmark' | 'check' | 'flag'> = {
  comment: 'message', reply: 'message', rate: 'star', react: 'heart',
  like: 'heart', list: 'bookmark', watch: 'check', favorite: 'heart', report: 'flag',
};

export function useAuthGate() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [reason, setReason] = useState<AuthGateReason | null>(null);

  /** Abre a folha de login. Para quem já tem um early return por conta própria. */
  const promptSignIn = useCallback((next: AuthGateReason) => setReason(next), []);

  /** Executa `action` quando há sessão; caso contrário abre a folha. */
  const requireAuth = useCallback((next: AuthGateReason, action: () => void) => {
    if (user) { action(); return; }
    setReason(next);
  }, [user]);

  const close = () => setReason(null);
  const go = (mode: 'login' | 'register') => {
    setReason(null);
    router.push(mode === 'register' ? '/auth?mode=register' : '/auth');
  };

  const authGate = (
    <BottomSheet visible={reason !== null} onClose={close} title={t('gate.title')}>
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
  );

  return { requireAuth, promptSignIn, authGate, isSignedIn: !!user };
}
