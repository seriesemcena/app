'use client';
/* ─────────────────────────────────────────────────────────────
   ReportSheet — fluxo único de denúncia/relato do app.

   kind 'comment' → Spoiler sem aviso · Spam · Ofensa
   kind 'profile' → Spam · Outros (com caixa de texto)
   kind 'problem' → caixa de texto livre ("Relatar problema")

   Tudo vai para a coleção `reports` (create liberado a qualquer
   logado; leitura/gestão só no painel /admin via rules).
   ───────────────────────────────────────────────────────────── */
import { useState } from 'react';
import { BottomSheet, Txt, Btn } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { useAuth } from '@/hooks/useAuth';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { dbReportStore, type ReportDoc } from '@/lib/db';
import { profileStore } from '@/lib/store';

export type ReportTarget = {
  kind: ReportDoc['kind'];
  /** reviewId | username | titleKey */
  targetId: string;
  /** nome do título ou @username — o que o admin vê */
  targetLabel: string;
  titleKey?: string;
  contentSnippet?: string;
  reportedUser?: string;
};

const TITLES: Record<ReportDoc['kind'], string> = {
  comment: 'Denunciar comentário',
  profile: 'Denunciar perfil',
  problem: 'Relatar problema',
};

const REASONS: Record<ReportDoc['kind'], Array<{ id: ReportDoc['reason']; label: string; needsText?: boolean }>> = {
  comment: [
    { id: 'spoiler', label: 'Spoiler sem aviso' },
    { id: 'spam',    label: 'Spam' },
    { id: 'offense', label: 'Ofensa' },
  ],
  profile: [
    { id: 'spam',  label: 'Spam' },
    { id: 'other', label: 'Outros', needsText: true },
  ],
  problem: [], // texto livre direto
};

export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason]   = useState<ReportDoc['reason'] | null>(null);
  const [details, setDetails] = useState('');
  const [state, setState]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const visible = target !== null;
  const kind    = target?.kind ?? 'comment';
  const reasons = REASONS[kind];
  const needsText = kind === 'problem' || reasons.find(r => r.id === reason)?.needsText;
  const canSend = state === 'idle'
    && (kind === 'problem' ? details.trim().length > 2 : reason !== null)
    && (!needsText || details.trim().length > 2);

  const reset = () => { setReason(null); setDetails(''); setState('idle'); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!target || !canSend) return;
    if (!user || !firebaseConfigured) { setState('error'); return; }
    setState('sending');
    const prof = profileStore.get(user.uid);
    const ok = await dbReportStore.add(getDB(), {
      kind: target.kind,
      reason: kind === 'problem' ? 'problem' : (reason as ReportDoc['reason']),
      details: details.trim() || undefined,
      targetId: target.targetId,
      titleKey: target.titleKey,
      targetLabel: target.targetLabel,
      contentSnippet: target.contentSnippet,
      reportedUser: target.reportedUser,
      reportedBy: user.uid,
      reportedByName: prof.username || prof.name || user.displayName || '',
    });
    if (!ok) { setState('error'); return; }
    setState('sent');
    setTimeout(close, 1400);
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={target ? TITLES[target.kind] : ''}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 8px' }}>

        {state === 'sent' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={26} color="#4ade80" />
            </div>
            <Txt size={14} weight={700} color={T.t1}>
              {kind === 'problem' ? 'Problema relatado. Obrigado!' : 'Denúncia enviada. Obrigado!'}
            </Txt>
            <Txt size={12} color={T.t3}>Nossa equipe vai analisar.</Txt>
          </div>
        ) : (
          <>
            {target && kind !== 'problem' && (
              <Txt size={12} color={T.t3} style={{ display: 'block', marginBottom: 2 }}>
                {kind === 'profile' ? `Perfil: ${target.targetLabel}` : `Em: ${target.targetLabel}`}
              </Txt>
            )}

            {/* motivos */}
            {reasons.map(r => {
              const sel = reason === r.id;
              return (
                <button key={r.id} onClick={() => setReason(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '14px 16px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    background: sel ? 'rgba(192,105,255,0.10)' : T.surface2,
                    border: `2px solid ${sel ? T.pink : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                    border: `2px solid ${sel ? T.pink : T.t3}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sel && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.pink }} />}
                  </div>
                  <Txt size={14} weight={600} color={T.t1}>{r.label}</Txt>
                </button>
              );
            })}

            {/* caixa de texto (Outros / Relatar problema) */}
            {needsText && (
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder={kind === 'problem'
                  ? 'Descreva o problema encontrado nesta página…'
                  : 'Descreva o motivo da denúncia…'}
                maxLength={500}
                autoFocus={kind === 'problem'}
                style={{
                  width: '100%', minHeight: 96, resize: 'none', boxSizing: 'border-box',
                  padding: '13px 14px', borderRadius: 14, outline: 'none',
                  background: 'var(--c-input-bg)', border: `1px solid ${T.border}`,
                  color: T.t1, fontSize: 14, fontFamily: "'Area','Inter',sans-serif",
                }}
              />
            )}

            {state === 'error' && (
              <Txt size={12} color={T.red ?? '#ff4444'} style={{ display: 'block' }}>
                {!user ? 'Faça login para denunciar.' : 'Erro ao enviar. Tente novamente.'}
              </Txt>
            )}

            <Btn
              label={state === 'sending' ? 'Enviando…' : 'Enviar'}
              variant="pink" full
              onClick={submit}
              disabled={!canSend}
            />
          </>
        )}
      </div>
    </BottomSheet>
  );
}
