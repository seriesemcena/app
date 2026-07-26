'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

type InfiniteScrollOptions<T extends HTMLElement> = {
  rootRef: RefObject<T | null>;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void | Promise<void>;
  enabled?: boolean;
  rootMargin?: string;
};

/**
 * Observa um marcador dentro do contêiner de rolagem da própria tela.
 * O callback fica em uma ref para que mudanças de renderização não recriem
 * o observer enquanto uma página está sendo buscada.
 */
export function useInfiniteScroll<T extends HTMLElement>({
  rootRef,
  hasMore,
  loading,
  onLoadMore,
  enabled = true,
  rootMargin = '0px 0px 240px 0px',
}: InfiniteScrollOptions<T>) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  const [observerSupported, setObserverSupported] = useState(true);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setObserverSupported(false);
      return;
    }

    setObserverSupported(true);
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !enabled || !hasMore || loading) return;

    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (requested || !entries.some((entry) => entry.isIntersecting)) return;
      requested = true;
      observer.disconnect();
      void loadMoreRef.current();
    }, {
      root,
      rootMargin,
      threshold: 0,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, loading, rootMargin, rootRef]);

  return { sentinelRef, observerSupported };
}
