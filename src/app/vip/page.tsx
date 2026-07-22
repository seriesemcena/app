'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T, type IconName } from '@/lib/tokens';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import { navigateBack } from '@/lib/navigation';
import { PRO_SELF_SERVICE_ENABLED } from '@/lib/features';

const PLAN_PRICES: Record<'monthly' | 'annual', { price: string }> = {
  monthly: { price: 'R$ 14,90' },
  annual:  { price: 'R$ 9,90'  },
};

const FEATURE_ICONS: IconName[] = ['user', 'award', 'home', 'bell'];
const FEATURE_KEYS = ['profileTheme', 'monthlyBadges', 'customHome', 'reminderLists'] as const;
const TABLE_VALUES: [string, string][] = [
  ['✓', '✓'], ['✓', '✓'], ['—', '✓'], ['—', '✓'], ['—', '✓'], ['—', '✓'],
];

export default function PROPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');

  const PLANS = {
    monthly: { label: t('vip.planMonthly'), price: PLAN_PRICES.monthly.price, period: t('vip.perMonth'), save: null as string | null },
    annual:  { label: t('vip.planAnnual'),  price: PLAN_PRICES.annual.price,  period: t('vip.perMonth'), save: t('vip.planSave') },
  };

  const FEATURES = FEATURE_KEYS.map((key, i) => ({
    icon: FEATURE_ICONS[i],
    label: t(`vip.features.${key}`),
    desc: t(`vip.features.${key}Desc`),
  }));

  const tableRows = t('vip.tableRows', { returnObjects: true }) as string[];

  return (
    <Frame>
      <Screen>
        <div style={{ position: 'absolute', top: 'calc(var(--safe-area-top) + 12px)', left: 12, zIndex: 20 }}>
          <button onClick={() => navigateBack(router)} style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 1px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.3)' } as React.CSSProperties}>
            <Icon name="close" size={18} color={T.white} />
          </button>
        </div>

        <ScrollArea>
          <div style={{ height: 200, background: `linear-gradient(135deg,#1a1200,#2d2000,#1a0a00)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom,transparent 60%,${T.bg} 100%)` }} />
            <div style={{ width: 64, height: 64, borderRadius: 32, background: T.goldDim, border: `2px solid rgba(245,197,24,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, boxShadow: `0 0 30px rgba(245,197,24,0.2)` }}>
              <Icon name="crown" size={30} color={T.gold} />
            </div>
            <div style={{ zIndex: 5, textAlign: 'center' }}>
              <Txt size={22} weight={800} color={T.gold} style={{ display: 'block' }}>{t('items.vip')}</Txt>
              <Txt size={13} color={T.t3}>{t('vip.tagline')}</Txt>
            </div>
          </div>

          <div style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {(Object.entries(PLANS) as [keyof typeof PLANS, typeof PLANS['monthly']][]).map(([key, p]) => (
                <button key={key} onClick={() => setPlan(key)} style={{ flex: 1, padding: '14px 12px', borderRadius: T.radiusSm, background: plan === key ? T.goldDim : 'transparent', border: plan === key ? `2px solid ${T.gold}` : `1px solid ${T.border}`, cursor: 'pointer', textAlign: 'center', position: 'relative' }}>
                  {p.save && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: T.gold, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}><Txt size={9} weight={800} color="#000">{p.save}</Txt></div>}
                  <Txt size={12} weight={600} color={plan === key ? T.gold : T.t3} style={{ display: 'block', marginBottom: 4 }}>{p.label}</Txt>
                  <Txt size={22} weight={800} color={plan === key ? T.gold : T.t1} style={{ display: 'block' }}>{p.price}</Txt>
                  <Txt size={11} color={T.t3}>{p.period}</Txt>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <Txt size={11} weight={700} color={T.t2} style={{ display: 'block', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('vip.featuresTitle')}</Txt>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {FEATURES.map((f) => (
                  <div key={f.label} style={{ display: 'flex', gap: 10, padding: 12, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, alignItems: 'flex-start' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: T.goldDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={f.icon} size={15} color={T.gold} />
                    </div>
                    <div>
                      <Txt size={11} weight={700} style={{ display: 'block', lineHeight: 1.3 }}>{f.label}</Txt>
                      <Txt size={10} color={T.t3} style={{ display: 'block', lineHeight: 1.3, marginTop: 2 }}>{f.desc}</Txt>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: T.surface2 }}>
                <div style={{ padding: '10px 12px' }}><Txt size={11} weight={700} color={T.t3}>{t('vip.tableFeature')}</Txt></div>
                <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={11} weight={700} color={T.t3}>{t('vip.tableFree')}</Txt></div>
                <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={11} weight={700} color={T.gold}>{t('vip.tableVip')}</Txt></div>
              </div>
              {tableRows.map((row, i) => {
                const [f, v] = TABLE_VALUES[i] ?? ['—', '—'];
                return (
                  <div key={row} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : T.surface }}>
                    <div style={{ padding: '10px 12px' }}><Txt size={11} color={T.t2}>{row}</Txt></div>
                    <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={12} color={f === '✓' ? '#4ade80' : T.t4}>{f}</Txt></div>
                    <div style={{ padding: '10px 12px', textAlign: 'center' }}><Txt size={12} color={v === '✓' ? T.gold : T.t4}>{v}</Txt></div>
                  </div>
                );
              })}
            </div>

            <button disabled={!PRO_SELF_SERVICE_ENABLED} style={{ width: '100%', padding: '16px 0', borderRadius: T.radiusSm, background: T.surface2, border: `1px solid ${T.border}`, cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, opacity: 0.72 }}>
              <Icon name="crown" size={18} color={T.t3} />
              <Txt size={15} weight={800} color={T.t3}>{t('vip.unavailable')}</Txt>
            </button>

            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <Txt size={11} color={T.t3}>{t('vip.trialNote')}</Txt>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <Txt size={10} color={T.t4}>{t('vip.paymentNote')}</Txt>
            </div>
          </div>
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
