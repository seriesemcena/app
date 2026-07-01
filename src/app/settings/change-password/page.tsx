'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Txt, Btn, Toast } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '13px 44px 13px 14px',
  background: 'var(--c-input-bg)',
  border: '1px solid var(--c-border)',
  borderRadius: 12, color: T.t1, fontSize: 14,
  fontFamily: "'Area','Inter',sans-serif",
  outline: 'none', boxSizing: 'border-box',
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const update = (k: keyof typeof form, v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    setError('');
  };

  const submit = () => {
    if (!form.current) { setError('Informe a senha atual.'); return; }
    if (form.next.length < 6) { setError('A nova senha precisa ter ao menos 6 caracteres.'); return; }
    if (form.next !== form.confirm) { setError('As senhas não coincidem.'); return; }
    setToast('Senha alterada com sucesso!');
    setTimeout(() => router.back(), 1200);
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

  const strengthLabel = ['', 'Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte'];
  const strengthColor = ['', T.red, '#f97316', '#eab308', '#22c55e', '#10b981'];
  const str = strength();

  const Field = ({ label, fk }: { label: string; fk: keyof typeof form }) => (
    <div>
      <Txt size={11} weight={700} color={T.t3} style={{ display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Txt>
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
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Icon name="eye" size={18} color={T.t3} />
        </button>
      </div>
    </div>
  );

  return (
    <Frame>
      <Screen>
        <AppBar
          title="Alterar senha"
          left={<button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>}
        />
        <ScrollArea>
          <div style={{ padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Field label="Senha atual" fk="current" />
            <Field label="Nova senha" fk="next" />

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

            <Field label="Confirmar nova senha" fk="confirm" />

            {error && (
              <div style={{ padding: '10px 14px', background: T.redDim, borderRadius: 8, border: `1px solid rgba(229,9,20,0.3)` }}>
                <Txt size={13} color={T.red}>{error}</Txt>
              </div>
            )}

            <div style={{ padding: 16, background: T.card, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <Txt size={12} color={T.t3} style={{ display: 'block', lineHeight: 1.6 }}>
                💡 Use ao menos 8 caracteres, incluindo letras maiúsculas, números e símbolos para uma senha forte.
              </Txt>
            </div>

            <Btn label="Alterar senha" variant="primary" full onClick={submit} />
          </div>
        </ScrollArea>
        <Toast msg={toast} visible={!!toast} icon="check" />
      </Screen>
    </Frame>
  );
}
