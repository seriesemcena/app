'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen, ScrollArea, AppBar, Chip, Txt, VIPBadge } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type CalEvent = { date: number; month: number; title: string; type: 'cinema' | 'streaming'; stream?: string; isVIP?: boolean };

const CAL_EVENTS: CalEvent[] = [
  { date: 29, month: 3, title: 'Duna: Parte 3', type: 'cinema', isVIP: false },
  { date: 30, month: 3, title: 'House of Dragon T2', type: 'streaming', stream: 'HBO Max', isVIP: false },
  { date: 1, month: 4, title: 'The Bear T4', type: 'streaming', stream: 'Disney+', isVIP: true },
  { date: 3, month: 4, title: 'Deadpool 4', type: 'cinema', isVIP: true },
  { date: 5, month: 4, title: 'Andor S2 E5', type: 'streaming', stream: 'Disney+', isVIP: false },
  { date: 7, month: 4, title: 'Severance T3', type: 'streaming', stream: 'Apple TV+', isVIP: true },
  { date: 10, month: 4, title: 'Missão Impossível 8', type: 'cinema', isVIP: false },
  { date: 12, month: 4, title: 'Stranger Things T5', type: 'streaming', stream: 'Netflix', isVIP: false },
  { date: 15, month: 4, title: 'Black Mirror S7', type: 'streaming', stream: 'Netflix', isVIP: false },
];

export default function CalendarPage() {
  const router = useRouter();
  const [view, setView] = useState<'semana' | 'mês'>('semana');
  const [month, setMonth] = useState(3);
  const [year] = useState(2025);
  const [selDay, setSelDay] = useState(29);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const eventsForDay = (d: number) => CAL_EVENTS.filter((e) => e.date === d && e.month === month);
  const selectedEvents = eventsForDay(selDay);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = selDay - 3 + i;
    return d >= 1 && d <= daysInMonth ? d : null;
  });

  return (
    <Frame>
      <Screen>
        <AppBar
          title={`${MONTHS[month]} ${year}`}
          left={<button onClick={() => setMonth((m) => (m === 0 ? 11 : m - 1))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronL" size={20} color={T.t2} /></button>}
          right={<button onClick={() => setMonth((m) => (m === 11 ? 0 : m + 1))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="chevronR" size={20} color={T.t2} /></button>}
        />

        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {(['semana', 'mês'] as const).map((v) => (
            <Chip key={v} label={v.charAt(0).toUpperCase() + v.slice(1)} active={view === v} onClick={() => setView(v)} />
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => router.push('/vip')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.goldDim, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 20, padding: '6px 12px', cursor: 'pointer' }}>
            <Icon name="crown" size={12} color={T.gold} />
            <Txt size={11} weight={700} color={T.gold}>Calendário VIP</Txt>
          </button>
        </div>

        <ScrollArea>
          {view === 'semana' ? (
            <>
              <div style={{ display: 'flex', padding: '12px 16px', gap: 6, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                {weekDays.map((d, i) => {
                  if (!d) return <div key={i} style={{ flex: 1 }} />;
                  const hasEvents = eventsForDay(d).length > 0;
                  const isSelected = d === selDay;
                  return (
                    <button key={d} onClick={() => setSelDay(d)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer', padding: '8px 4px', borderRadius: T.radiusSm, background: isSelected ? T.red : 'transparent' }}>
                      <Txt size={10} color={isSelected ? T.white : T.t3}>{DAYS[new Date(year, month, d).getDay()]}</Txt>
                      <Txt size={15} weight={700} color={isSelected ? T.white : T.t1}>{d}</Txt>
                      {hasEvents ? <div style={{ width: 5, height: 5, borderRadius: 3, background: isSelected ? T.white : T.red }} /> : <div style={{ width: 5, height: 5 }} />}
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: '16px' }}>
                <Txt size={13} weight={600} color={T.t3} style={{ display: 'block', marginBottom: 12 }}>
                  {selDay} de {MONTHS[month]} · {selectedEvents.length} estreia{selectedEvents.length !== 1 ? 's' : ''}
                </Txt>
                {selectedEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Icon name="calendar" size={40} color={T.t4} style={{ marginBottom: 12 }} />
                    <Txt size={14} color={T.t3} style={{ display: 'block' }}>Nenhuma estreia neste dia</Txt>
                  </div>
                ) : selectedEvents.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', background: T.card, borderRadius: T.radiusSm, border: `1px solid ${ev.isVIP ? 'rgba(245,197,24,0.2)' : T.border}`, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: ev.type === 'cinema' ? T.redDim : T.surface, border: `1px solid ${ev.type === 'cinema' ? T.red : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name={ev.type === 'cinema' ? 'film' : 'play'} size={20} color={ev.type === 'cinema' ? T.red : T.t2} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Txt size={14} weight={700}>{ev.title}</Txt>
                        {ev.isVIP && <VIPBadge />}
                      </div>
                      <div style={{ padding: '2px 8px', borderRadius: 5, background: ev.type === 'cinema' ? T.redDim : T.surface, display: 'inline-flex' }}>
                        <Txt size={10} weight={700} color={ev.type === 'cinema' ? T.red : T.t3}>{ev.type === 'cinema' ? 'Cinema' : ev.stream}</Txt>
                      </div>
                    </div>
                    <Icon name="bell" size={16} color={T.t4} />
                  </div>
                ))}

                <div onClick={() => router.push('/vip')} style={{ marginTop: 8, padding: '14px 16px', borderRadius: T.radiusSm, background: T.goldDim, border: `1px solid rgba(245,197,24,0.2)`, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <Icon name="crown" size={22} color={T.gold} />
                  <div style={{ flex: 1 }}>
                    <Txt size={13} weight={700} color={T.gold} style={{ display: 'block' }}>Desbloqueie o calendário completo</Txt>
                    <Txt size={11} color={T.t3}>Alertas antecipados e filtros avançados com VIP</Txt>
                  </div>
                  <Icon name="chevronR" size={16} color={T.gold} />
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                {DAYS.map((d) => <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}><Txt size={10} color={T.t3} weight={600}>{d}</Txt></div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1;
                  const events = eventsForDay(d);
                  const isSelected = d === selDay;
                  return (
                    <button key={d} onClick={() => setSelDay(d)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8, background: isSelected ? T.red : 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Txt size={12} weight={isSelected ? 700 : 400} color={isSelected ? T.white : T.t1}>{d}</Txt>
                      {events.length > 0 ? (
                        <div style={{ display: 'flex', gap: 2 }}>
                          {events.slice(0, 2).map((e, j) => (
                            <div key={j} style={{ width: 4, height: 4, borderRadius: 2, background: isSelected ? T.white : e.isVIP ? T.gold : T.red }} />
                          ))}
                        </div>
                      ) : <div style={{ width: 4, height: 4 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ height: 90 }} />
        </ScrollArea>
      </Screen>
    </Frame>
  );
}
