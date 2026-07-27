'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  giphyDisplayUrl,
  giphyFallbackUrl,
  type GiphyGif,
} from '@/lib/giphy';

export function GiphyImage({
  gif,
  alt,
  style,
  eager = false,
}: {
  gif: GiphyGif;
  alt?: string;
  style?: CSSProperties;
  eager?: boolean;
}) {
  const preferredUrl = giphyDisplayUrl(gif);
  const fallbackUrl = giphyFallbackUrl(gif);
  const [src, setSrc] = useState(preferredUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(preferredUrl);
    setFailed(false);
  }, [preferredUrl]);

  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? gif.title}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (fallbackUrl && src !== fallbackUrl) setSrc(fallbackUrl);
        else setFailed(true);
      }}
      style={style}
    />
  );
}
