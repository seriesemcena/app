export type GiphyGif = {
  id: string;
  title: string;
  images: {
    fixed_height_small: {
      url: string;
      webp?: string;
      width: string;
      height: string;
    };
  };
};

const GIPHY_REQUEST_TIMEOUT_MS = 10_000;

export function giphyDisplayUrl(gif: GiphyGif) {
  return gif.images.fixed_height_small.webp || gif.images.fixed_height_small.url;
}

export function giphyFallbackUrl(gif: GiphyGif) {
  return gif.images.fixed_height_small.url;
}

export async function fetchGiphyGifs(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<GiphyGif[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, GIPHY_REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(
      `/api/giphy?q=${encodeURIComponent(query)}&limit=${limit}`,
      { cache: 'no-store', signal: controller.signal },
    );
    if (!response.ok) throw new Error(`Giphy request failed (${response.status})`);
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
