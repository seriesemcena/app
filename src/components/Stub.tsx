'use client';
import { Frame } from './Frame';
import { Screen, AppBar, Txt } from './primitives';
import { Icon } from './Icon';
import { T } from '@/lib/tokens';

export function Stub({ title, hint = 'Em construção — chega na próxima iteração.', onBack }: { title: string; hint?: string; onBack?: () => void }) {
  return (
    <Frame>
      <Screen>
        <AppBar title={title} left={onBack ? (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
            <Icon name="chevronL" size={20} color={T.t1} />
          </button>
        ) : undefined} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.card, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="film" size={28} color={T.pink} />
          </div>
          <Txt size={18} weight={800}>{title}</Txt>
          <Txt size={13} color={T.t3} style={{ maxWidth: 280, lineHeight: 1.5 }}>{hint}</Txt>
        </div>
      </Screen>
    </Frame>
  );
}
