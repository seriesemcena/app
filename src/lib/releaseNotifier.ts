/* ─────────────────────────────────────────────────────────────
   Release Notifier — checks TMDB for upcoming releases (next
   TV episode / movie premiere) of titles in the user's lists
   and fires push notifications when a release is ≤ N days away.
   ───────────────────────────────────────────────────────────── */
import { listStore, notifiedStore } from './store';

/** Notify when release is within this many days (inclusive) */
export const DAYS_THRESHOLD = 3;

interface ListedItem {
  id: number;
  title: string;
  type: string;
  poster_path?: string | null;
}

interface NotifyResult {
  /** Number of new notifications fired this run */
  fired: number;
  /** Number of items checked */
  checked: number;
  /** Items that have upcoming releases but were already notified */
  skipped: number;
}

/* ── Send via service worker (works in background) or fallback ── */
async function fireNotification(title: string, body: string, url = '/'): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
        tag: title,
      } as NotificationOptions);
      return;
    }
  } catch { /* fall through */ }

  try { new Notification(title, { body }); } catch { /* ignore */ }
}

/* ── Days between two dates (UTC, ignoring time) ── */
function daysBetween(target: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

function dayLabel(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

/* ── Check a single TV item ── */
async function checkTV(item: ListedItem): Promise<'fired' | 'skipped' | 'none'> {
  const res = await fetch(`/api/tmdb?endpoint=/tv/${item.id}`);
  if (!res.ok) return 'none';
  const data = await res.json();
  const next = data.next_episode_to_air;
  if (!next?.air_date) return 'none';

  const days = daysBetween(next.air_date);
  if (days < 0 || days > DAYS_THRESHOLD) return 'none';

  const key = `tv-${item.id}-s${next.season_number}e${next.episode_number}`;
  if (notifiedStore.has(key)) return 'skipped';

  const epName = next.name ? ` "${next.name}"` : '';
  const seasonEp = `T${next.season_number}E${String(next.episode_number).padStart(2, '0')}`;
  await fireNotification(
    `📺 Novo episódio de ${item.title}`,
    `${seasonEp}${epName} estreia ${dayLabel(days)} (${next.air_date})`,
    `/title/tv/${item.id}`
  );
  notifiedStore.mark(key);
  return 'fired';
}

/* ── Check a single movie item ── */
async function checkMovie(item: ListedItem): Promise<'fired' | 'skipped' | 'none'> {
  const res = await fetch(`/api/tmdb?endpoint=/movie/${item.id}`);
  if (!res.ok) return 'none';
  const data = await res.json();
  if (!data.release_date) return 'none';

  const days = daysBetween(data.release_date);
  if (days < 0 || days > DAYS_THRESHOLD) return 'none';

  const key = `movie-${item.id}-${data.release_date}`;
  if (notifiedStore.has(key)) return 'skipped';

  await fireNotification(
    `🎬 Estreia próxima: ${item.title}`,
    `Lançamento ${dayLabel(days)} (${data.release_date})`,
    `/title/movie/${item.id}`
  );
  notifiedStore.mark(key);
  return 'fired';
}

/* ── Main entry: scan want + watching lists ── */
export async function checkUpcomingReleases(): Promise<NotifyResult> {
  const result: NotifyResult = { fired: 0, checked: 0, skipped: 0 };

  if (typeof window === 'undefined') return result;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return result;

  /* Combine "want" and "watching" lists, dedup by id */
  const all = [...listStore.get('want'), ...listStore.get('watching')];
  const seen = new Set<number>();
  const items = all.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  }) as ListedItem[];

  /* Sequential to avoid hammering TMDB / our proxy */
  for (const item of items) {
    result.checked += 1;
    try {
      const outcome = item.type === 'tv'
        ? await checkTV(item)
        : await checkMovie(item);
      if (outcome === 'fired')   result.fired   += 1;
      if (outcome === 'skipped') result.skipped += 1;
    } catch { /* ignore per-item errors */ }
  }

  return result;
}
