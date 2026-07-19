'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader, SettingsPrimaryButton, settingsInputStyle } from '@/components/SettingsLayout';
import { T } from '@/lib/tokens';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { navigateBack } from '@/lib/navigation';

const INPUT: React.CSSProperties = {
  ...settingsInputStyle,
  padding: '17px 48px 17px 16px',
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const update = (k: keyof typeof form, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setError('');
  };

  const submit = () => {
    if (!form.current) { setError(t('changePassword.errorCurrent')); return; }
    if (form.next.length < 6) { setError(t('changePassword.errorTooShort')); return; }
    if (form.next !== form.confirm) { setError(t('changePassword.errorMismatch')); return; }
    setToast(t('changePassword.success'));
    setTimeout(() => navigateBack(router, '/settings'), 1200);
  };

  const strength = () => {
    const p = form.next;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6) s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };

  const strengthLabel = ['', t('changePassword.strengthVeryWeak'), t('changePassword.strengthWeak'), t('changePassword.strengthMedium'), t('changePassword.strengthStrong'), t('changePassword.strengthVeryStrong')];
  const strengthColor = ['', T.red, '#f97316', '#eab308', '#22c55e', '#10b981'];
  const str = strength();

  const Field = ({ label, fk, last = false }: { label: string; fk: keyof typeof form; last?: boolean }) => (
    <div style={{ borderBottom: last ? 'none' : `1px solid ${T.border}` }}>
      <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', padding: '13px 16px 0', letterSpacing: 0.2 }}>{label}</Txt>
      <div style={{ position: 'relative' }}>
        <input
          type={show[fk] ? 'text' : 'password'}
          style={INPUT}
          value={form[fk]}
          placeholder="••••••••"
          onChange={e => update(fk, e.target.value)}
        />
        <button
          onClick={() => setShow(p => ({ ...p, [fk]: !p[fk] }))}
          type="button"
          aria-label={show[fk] ? 'Ocultar senha' : 'Mostrar senha'}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
        >
          <Icon name="eye" size={18} color={T.t3} />
        </button>
      </div>
    </div>
  );

  return (
    <Frame>
      <Screen>
        <SettingsHeader title={t('changePassword.title')} onBack={() => navigateBack(router, '/settings')} />
        <ScrollArea>
          <div style={{ padding: '18px 16px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            <SettingsCard>
              <Field label={t('changePassword.currentPassword')} fk="current" />
              <Field label={t('changePassword.newPassword')} fk="next" />
              <Field label={t('changePassword.confirmPassword')} fk="confirm" last />
            </SettingsCard>

            {/* strength bar */}
            {form.next.length > 0 && (
              <div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= str ? strengthColor[str] : T.surface2, transition: 'background 0.3s' }} />
                  ))}
                </div>
                <Txt size={11} color={strengthColor[str]} weight={600}>{strengthLabel[str]}</Txt>
              </div>
            )}

            {error && (
              <div style={{ padding: '12px 14px', background: T.redDim, borderRadius: 14 }}>
                <Txt size={13} color={T.red}>{error}</Txt>
              </div>
            )}

            <SettingsCard style={{ padding: 16 }}>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>
                {t('changePassword.tip')}
              </Txt>
            </SettingsCard>

            <SettingsPrimaryButton label={t('changePassword.button')} onClick={submit} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}
