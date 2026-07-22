'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { Frame } from '@/components/Frame';
import { Screen, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { SettingsCard, SettingsHeader } from '@/components/SettingsLayout';
import { T } from '@/lib/tokens';
import { useLocale, SUPPORTED_LOCALES } from '@/context/LocaleContext';
import { navigateBack } from '@/lib/navigation';
import { REGION_OPTIONS } from '@/lib/regions';

export default function LanguagePage() {
  const router = useRouter();
  const { t }  = useTranslation('settings');
  const { locale, country, setLocale, setCountry } = useLocale();

  const [savedMsg, setSavedMsg] = useState(false);

  function handleLocale(l: string) {
    setLocale(l);
    flash();
  }

  function handleCountry(c: string) {
    setCountry(c);
    flash();
  }

  function flash() {
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  const OptionRow = ({
    label, selected, onSelect, last = false,
  }: { label: string; selected: boolean; onSelect: () => void; last?: boolean }) => (
    <button
      onClick={onSelect}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
      }}
    >
      <Txt size={14} weight={selected ? 600 : 400} color={selected ? T.pink : T.t1}>
        {label}
      </Txt>
      {selected && <Icon name="check" size={16} color={T.pink} />}
    </button>
  );

  return (
    <Frame>
      <Screen>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingBottom: 'var(--tab-h, 90px)' } as React.CSSProperties}>
          <SettingsHeader title={t('language.title')} onBack={() => navigateBack(router, '/settings')} />

          <div style={{ padding: '18px 16px 0' }}>
            {savedMsg && (
              <div style={{ background: T.goldDim, borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                <Txt size={13} color={T.gold}>{t('language.saved')}</Txt>
              </div>
            )}

            {/* Language section */}
            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', paddingLeft: 4, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('language.languageLabel')}
            </Txt>
            <SettingsCard style={{ marginBottom: 24 }}>
              {SUPPORTED_LOCALES.map((loc, index) => (
                <OptionRow
                  key={loc.code}
                  label={loc.label}
                  selected={locale === loc.code}
                  onSelect={() => handleLocale(loc.code)}
                  last={index === SUPPORTED_LOCALES.length - 1}
                />
              ))}
            </SettingsCard>

            {/* Country section */}
            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', paddingLeft: 4, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('language.countryLabel')}
            </Txt>
            <SettingsCard style={{ marginBottom: 24 }}>
              {REGION_OPTIONS.map((c, index) => (
                <OptionRow
                  key={c.code}
                  label={`${c.flag}  ${c.code} — ${c.label}`}
                  selected={country === c.code}
                  onSelect={() => handleCountry(c.code)}
                  last={index === REGION_OPTIONS.length - 1}
                />
              ))}
            </SettingsCard>

            <Txt size={12} color={T.t3} style={{ display: 'block', textAlign: 'center', paddingBottom: 16 }}>
              {t('language.note')}
            </Txt>
          </div>
        </div>
      </Screen>
    </Frame>
  );
}
