'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, AppBar, Chip, VIPBadge, Txt } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';
import { authHeader } from '@/lib/firebase';
import { navigateBack } from '@/lib/navigation';

type Msg = { role: 'user' | 'assistant'; text: string };

const GENRES = ['Drama', 'Ação', 'Comédia', 'Terror', 'Sci-Fi', 'Romance', 'Thriller', 'Animação', 'Documentário', 'Fantasia'];

export default function AIAssistantPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: 'Olá! Sou seu assistente VIP de recomendações 🎬\n\nMe diga o que está com vontade de assistir — gênero, humor, temática, atores favoritos — e vou sugerir títulos perfeitos para você!' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState({ genre: 'Drama', minRating: 7, lang: 'Qualquer', decade: 'Qualquer' });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ prompt: userMsg, metrics }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', text: data.reply || 'Sem resposta.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Tive um problema para processar. Tente novamente!' }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    'Quero algo para ver com a família hoje à noite',
    'Me sugira um thriller psicológico tenso',
    'Série para maratonar num fim de semana',
    'Documentário imperdível dos últimos anos',
  ];

  return (
    <Frame>
      <Screen>
        <AppBar title="Assistente IA" left={
          <button onClick={() => navigateBack(router)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>
        } right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VIPBadge />
            <button onClick={() => setShowMetrics((m) => !m)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="settings" size={18} color={T.t2} />
            </button>
          </div>
        } />

        {showMetrics && (
          <div style={{ padding: '12px 16px', background: T.card, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <Txt size={11} color={T.t3} weight={700} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Suas métricas</Txt>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <Txt size={11} color={T.t2} style={{ display: 'block', marginBottom: 6 }}>Gênero favorito</Txt>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {GENRES.map((g) => <Chip key={g} label={g} active={metrics.genre === g} onClick={() => setMetrics((m) => ({ ...m, genre: g }))} />)}
                </div>
              </div>
              <div>
                <Txt size={11} color={T.t2} style={{ display: 'block', marginBottom: 6 }}>Nota mínima: {metrics.minRating}/10</Txt>
                <input type="range" min={1} max={10} step={0.5} value={metrics.minRating}
                  onChange={(e) => setMetrics((m) => ({ ...m, minRating: parseFloat(e.target.value) }))}
                  style={{ width: '100%', accentColor: T.pink }} />
              </div>
              <div>
                <Txt size={11} color={T.t2} style={{ display: 'block', marginBottom: 6 }}>Época</Txt>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Qualquer', '2020s', '2010s', '2000s', 'Clássicos'].map((d) => <Chip key={d} label={d} active={metrics.decade === d} onClick={() => setMetrics((m) => ({ ...m, decade: d }))} />)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } as React.CSSProperties}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 10 }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 32, height: 32, borderRadius: 16, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end', boxShadow: `0 2px 8px ${T.pinkGlow}` }}>
                  <Icon name="smile" size={16} color={T.white} />
                </div>
              )}
              <div style={{ maxWidth: '80%', padding: '12px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? T.pink : T.card, boxShadow: msg.role === 'user' ? `0 2px 12px ${T.pinkGlow}` : 'none', border: msg.role === 'assistant' ? `1px solid ${T.border}` : 'none' }}>
                <Txt size={13} color={T.white} style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap', display: 'block' }}>{msg.text}</Txt>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: T.pink, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="smile" size={16} color={T.white} />
              </div>
              <div style={{ padding: '12px 16px', background: T.card, borderRadius: '16px 16px 16px 4px', border: `1px solid ${T.border}`, display: 'flex', gap: 6, alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: T.pink, animation: `pulseDot 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          {messages.length <= 1 && !loading && (
            <div style={{ marginTop: 8 }}>
              <Txt size={11} color={T.t3} weight={600} style={{ display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Sugestões rápidas</Txt>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {quickPrompts.map((p) => (
                  <button key={p} onClick={() => sendMessage(p)} style={{ textAlign: 'left', padding: '12px 14px', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, cursor: 'pointer', color: T.t1, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", lineHeight: 1.4 }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ height: 10 }} />
        </div>

        <div style={{ padding: '12px 16px 24px', background: T.bg, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                placeholder="Descreva o que quer assistir..."
                rows={2} style={{ width: '100%', background: 'transparent', border: 'none', color: T.white, fontSize: 13, fontFamily: "'Area','Inter',sans-serif", padding: '10px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
              style={{ width: 44, height: 44, borderRadius: 22, background: input.trim() && !loading ? T.pink : T.surface2, border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: input.trim() && !loading ? `0 2px 10px ${T.pinkGlow}` : 'none' }}>
              <Icon name="chevronR" size={20} color={T.white} />
            </button>
          </div>
        </div>

        <style>{`@keyframes pulseDot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
      </Screen>
    </Frame>
  );
}
