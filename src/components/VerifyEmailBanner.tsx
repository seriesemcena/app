'use client';
/* ─────────────────────────────────────────────────────────────
   VerifyEmailBanner — lembrete persistente para confirmar o e-mail.

   Aparece para contas logadas cujo e-mail ainda não foi confirmado
   (só cadastros por e-mail/senha; Google/Apple já vêm verificados).
   Some sozinho quando o e-mail é confirmado — o AuthContext recarrega
   o usuário ao voltar para o app. Fecha por sessão (volta no próximo
   carregamento); as ações de escrita seguem travadas pelo gate.
   ───────────────────────────────────────────────────────────── */
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { useAuthContext } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppRuntime } from '@/context/AppRuntimeContext';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

export function VerifyEmailBanner() {
  const { user, emailVerified, offline } = useAuthContext();
  const { resendVerification } = useAuth();
  const { isOnline, isKeyboardOpen } = useAppRuntime();
  const { t } = useTranslation('auth');
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  const hiddenRoute = pathname.startsWith('/auth') || pathname.startsWith('/admin');
  if (offline || !user || emailVerified || dismissed || hiddenRoute || !isOnline || isKeyboardOpen) {
    return null;
  }

  const resend = async () => {
    setBusy(true);
    try { await resendVerification(); setResent(true); }
    catch { /* o usuário pode tentar novamente */ }
    finally { setBusy(false); }
  };

  return (
    <div className="verify-email-banner" role="status" aria-live="polite">
      <Icon name="lock" size={16} color={T.pink} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: 'var(--c-t1)' }}>
        {t('verifyBanner.text')}
      </span>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        style={{
          padding: '6px 10px', border: 0, borderRadius: 13,
          background: 'rgba(192,105,255,0.18)', color: T.pink,
          fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1,
        }}
      >
        {resent ? t('verifyBanner.resent') : t('verifyBanner.resend')}
      </button>
      <button
        type="button"
        aria-label={t('verifyBanner.dismiss')}
        onClick={() => setDismissed(true)}
        style={{ padding: 4, border: 0, background: 'transparent', cursor: 'pointer', display: 'flex' }}
      >
        <Icon name="close" size={16} color={T.t3} />
      </button>
    </div>
  );
}
