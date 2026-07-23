'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { T } from '@/lib/tokens';

type PushDetail = {
  title?: string;
  body?: string;
  url?: string;
};

type VisiblePush = {
  id: number;
  title: string;
  body: string;
  url: string;
};

/** Foreground push presentation.
 *
 * Native notification trays are intentionally reserved for background and
 * terminated states. While Maratonou is open, this banner makes the same FCM
 * message visible without generating a duplicate operating-system alert.
 */
export function PushAlert() {
  const router = useRouter();
  const [push, setPush] = useState<VisiblePush | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPush = (event: Event) => {
      const detail = (event as CustomEvent<PushDetail>).detail ?? {};
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      setPush({
        id: Date.now(),
        title: detail.title?.trim() || 'Maratonou',
        body: detail.body?.trim() || 'Você recebeu uma nova notificação.',
        url: detail.url?.startsWith('/') ? detail.url : '/notifications?tab=app',
      });
      dismissTimer.current = setTimeout(() => setPush(null), 6500);
    };

    window.addEventListener('maratonou:push', onPush);
    return () => {
      window.removeEventListener('maratonou:push', onPush);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!push) return null;

  return (
    <div
      key={push.id}
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: '50%',
        width: 'min(420px, calc(100vw - 28px))',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 18,
        border: `1px solid ${T.border}`,
        background: T.surface,
        boxShadow: '0 14px 40px rgba(0,0,0,0.42)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          setPush(null);
          router.push(push.url);
        }}
        style={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: T.t1,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: T.pinkGlow,
        }}>
          <Icon name="bell" size={19} color={T.pink} />
        </span>
        <span style={{ minWidth: 0, display: 'block' }}>
          <strong style={{ display: 'block', fontSize: 13, lineHeight: 1.3 }}>{push.title}</strong>
          <span style={{
            display: '-webkit-box',
            marginTop: 2,
            overflow: 'hidden',
            color: T.t2,
            fontSize: 12,
            lineHeight: 1.35,
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          }}>
            {push.body}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Fechar notificação"
        onClick={() => setPush(null)}
        style={{
          width: 30,
          height: 30,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          borderRadius: 15,
          background: T.surface2,
          cursor: 'pointer',
        }}
      >
        <Icon name="close" size={14} color={T.t2} />
      </button>
    </div>
  );
}
