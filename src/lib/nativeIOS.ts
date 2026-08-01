'use client';

type NativeRole = 'default' | 'destructive' | 'cancel';

export type NativeActionSheetAction = {
  id: string;
  title: string;
  role?: NativeRole;
  disabled?: boolean;
};

type NativeActionSheetOptions = {
  title?: string;
  message?: string;
  cancelTitle: string;
  actions: NativeActionSheetAction[];
};

type BridgeWindow = Window & {
  webkit?: {
    messageHandlers?: Record<string, { postMessage: (value: unknown) => void }>;
  };
  __MARATONOU_NATIVE_UI__?: unknown;
};

const RESULT_EVENT = 'maratonou:native-action-sheet-result';

export function nativeIOSUIAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const candidate = window as BridgeWindow;
  return Boolean(
    candidate.__MARATONOU_NATIVE_UI__
    && candidate.webkit?.messageHandlers?.maratonouNativeChrome,
  );
}

/**
 * Presents a UIKit action sheet. Returns `undefined` outside the native iOS
 * shell so callers can render their existing web fallback.
 */
export function presentNativeActionSheet(
  options: NativeActionSheetOptions,
): Promise<string | null> | undefined {
  if (!nativeIOSUIAvailable()) return undefined;
  const candidate = window as BridgeWindow;
  const handler = candidate.webkit?.messageHandlers?.maratonouNativeChrome;
  if (!handler) return undefined;

  const requestId = globalThis.crypto?.randomUUID?.()
    ?? `native-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{
        requestId?: string;
        actionId?: string | null;
      }>).detail;
      if (detail?.requestId !== requestId) return;
      window.removeEventListener(RESULT_EVENT, receive);
      resolve(detail.actionId ?? null);
    };
    window.addEventListener(RESULT_EVENT, receive);
    handler.postMessage({
      type: 'actionSheet',
      requestId,
      title: options.title,
      message: options.message,
      actions: [
        ...options.actions,
        { id: '__cancel__', title: options.cancelTitle, role: 'cancel' },
      ],
    });
  });
}
