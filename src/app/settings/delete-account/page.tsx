'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import {
  SettingsCard,
  SettingsHeader,
  SettingsPrimaryButton,
  settingsInputStyle,
} from '@/components/SettingsLayout';
import { useAuth } from '@/hooks/useAuth';
import { navigateBack } from '@/lib/navigation';
import { T } from '@/lib/tokens';

type CodedError = Error & { code?: string };

export default function DeleteAccountPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation('settings');
  const { user, deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const requiresPassword = Boolean(
    user?.providerData.some((provider) => provider.providerId === 'password'),
  );
  const confirmationWord = useMemo(() => {
    if (i18n.language.toLowerCase().startsWith('en')) return 'DELETE';
    if (i18n.language.toLowerCase().startsWith('es')) return 'ELIMINAR';
    return 'EXCLUIR';
  }, [i18n.language]);
  const confirmed = confirmation.trim().toLocaleUpperCase() === confirmationWord;
  const canSubmit = confirmed && (!requiresPassword || password.length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await deleteAccount(requiresPassword ? password : undefined);
    } catch (reason) {
      const code = (reason as CodedError)?.code || (reason as CodedError)?.message || '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setError(t('deleteAccount.errorPassword'));
      } else if (code.includes('missing-password')) {
        setError(t('deleteAccount.errorMissingPassword'));
      } else if (code.includes('requires-recent-login') || code.includes('failed-precondition')) {
        setError(t('deleteAccount.errorRecentLogin'));
      } else if (code.includes('unsupported-provider')) {
        setError(t('deleteAccount.errorUnsupported'));
      } else {
        setError(t('deleteAccount.errorGeneric'));
      }
      setSubmitting(false);
    }
  };

  return (
    <Frame>
      <Screen>
        <SettingsHeader
          title={t('deleteAccount.title')}
          onBack={() => navigateBack(router, '/settings')}
        />
        <ScrollArea>
          <div style={{ padding: '18px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SettingsCard style={{ padding: 18, border: `1px solid ${T.redDim}` }}>
              <Txt size={15} weight={800} color={T.red} style={{ display: 'block', marginBottom: 8 }}>
                {t('deleteAccount.title')}
              </Txt>
              <Txt size={13} color={T.t2} style={{ display: 'block', lineHeight: 1.6 }}>
                {t('deleteAccount.body')}
              </Txt>
            </SettingsCard>

            <div style={{ padding: '12px 14px', background: T.redDim, borderRadius: 14 }}>
              <Txt size={12} color={T.red} weight={650} style={{ display: 'block', lineHeight: 1.5 }}>
                {t('deleteAccount.warning')}
              </Txt>
            </div>

            <SettingsCard>
              {requiresPassword && (
                <label style={{ display: 'block', padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
                  <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 8 }}>
                    {t('deleteAccount.passwordLabel')}
                  </Txt>
                  <input
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    placeholder={t('deleteAccount.passwordPlaceholder')}
                    onChange={(event) => { setPassword(event.target.value); setError(''); }}
                    style={{ ...settingsInputStyle, padding: 0 }}
                  />
                </label>
              )}
              <label style={{ display: 'block', padding: '14px 16px' }}>
                <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 8 }}>
                  {t('deleteAccount.confirmationLabel')}
                </Txt>
                <input
                  type="text"
                  value={confirmation}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('deleteAccount.confirmationPlaceholder')}
                  onChange={(event) => { setConfirmation(event.target.value); setError(''); }}
                  style={{ ...settingsInputStyle, padding: 0 }}
                />
              </label>
            </SettingsCard>

            {error && (
              <div role="alert" style={{ padding: '12px 14px', background: T.redDim, borderRadius: 14 }}>
                <Txt size={13} color={T.red}>{error}</Txt>
              </div>
            )}

            <SettingsPrimaryButton
              label={submitting ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
              onClick={submit}
              disabled={!canSubmit}
              style={canSubmit ? { background: T.red, boxShadow: '0 8px 22px rgba(229,9,20,0.20)' } : undefined}
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => navigateBack(router, '/settings')}
              style={{
                minHeight: 48,
                borderRadius: 24,
                border: `1px solid ${T.border}`,
                background: T.card,
                color: T.t1,
                fontFamily: "'Area','Inter',sans-serif",
                fontSize: 14,
                fontWeight: 750,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >
              {t('deleteAccount.cancel')}
            </button>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
