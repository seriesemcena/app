/* ───────────────────────────────────────────────────────────
   Verified release notifier.

   TV: uses TMDB's next_episode_to_air and a configurable lead window.
   Movies: never treats release_date as a streaming date. It compares
   country-specific flatrate provider snapshots and only notifies when a
   provider is newly added after a baseline has already been recorded.
   ─────────────────────────────────────────────────────────── */
import {
  getActiveUser,
  isNotifEnabled,
  listStore,
  notifInboxStore,
  notifiedStore,
  prefsStore,
} from './store';
import { firebaseConfigured, getDB } from './firebase';
import { dbNotificationTemplateStore } from './db';
import { tmdbImg } from './tmdb';
import {
  notificationTemplateStore,
  renderNotificationTemplate,
  type NotificationTemplates,
} from './notificationTemplates';

/** Notify when a TV episode is within this many days (inclusive). */
export const DAYS_THRESHOLD = 3;

interface ListedItem {
  id: number;
  title: string;
  type: string;
  poster_path?: string | null;
}

interface Provider {
  provider_id?: number;
  provider_name?: string;
}

interface NotifyResult {
  fired: number;
  checked: number;
  skipped: number;
}

type CheckOutcome = 'fired' | 'skipped' | 'none';
type ProviderSnapshots = Record<string, string[]>;

const providerSnapshotKey = (uid: string) => `sec_provider_snapshots_v1_${uid}`;

function getProviderSnapshots(uid: string): ProviderSnapshots {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(providerSnapshotKey(uid)) || '{}'); } catch { return {}; }
}

function setProviderSnapshot(uid: string, key: string, providerNames: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const all = getProviderSnapshots(uid);
    all[key] = providerNames;
    localStorage.setItem(providerSnapshotKey(uid), JSON.stringify(all));
  } catch {}
}

async function fireNotification(title: string, body: string, url = '/'): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
        tag: `maratonou:${url}:${title}`,
      } as NotificationOptions);
      return true;
    }
  } catch { /* fall through */ }

  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

function daysBetween(target: string): number {
  const today = new Date();
  const [year, month, day] = target.split('-').map(Number);
  const targetUTC = Date.UTC(year, month - 1, day);
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUTC - todayUTC) / 86400000);
}

function dayLabel(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PLATFORM_ALIASES: Record<string, string[]> = {
  netflix: ['netflix'],
  primevideo: ['primevideo', 'amazonprimevideo'],
  disney: ['disney', 'disneyplus'],
  hbo: ['hbo', 'hbomax', 'max'],
  appletv: ['appletv', 'appletvplus'],
  globoplay: ['globoplay'],
  paramount: ['paramount', 'paramountplus'],
  mgm: ['mgm', 'mgmplus', 'mgmamazonchannel'],
};

function isSelectedProvider(provider: string, selected: string[]): boolean {
  const normalizedProvider = normalizeName(provider);
  return selected.some((platform) => {
    const normalizedSelected = normalizeName(platform);
    const aliases = Object.values(PLATFORM_ALIASES).find((group) => group.includes(normalizedSelected))
      ?? [normalizedSelected];
    return aliases.some((alias) => normalizedProvider === alias || normalizedProvider.includes(alias));
  });
}

async function deliver(
  uid: string,
  eventKey: string,
  type: 'new_episode' | 'release',
  title: string,
  body: string,
  link: string,
  posterPath?: string | null,
): Promise<void> {
  notifInboxStore.add({
    id: eventKey,
    type,
    title,
    body,
    time: new Date().toISOString(),
    read: false,
    link,
    poster: tmdbImg(posterPath, 'w154') ?? undefined,
  }, uid);
  await fireNotification(title, body, link);
}

async function checkTV(
  item: ListedItem,
  uid: string,
  templates: NotificationTemplates,
): Promise<CheckOutcome> {
  const prefs = prefsStore.get();
  if (!isNotifEnabled(prefs, 'episodes') || !templates.new_episode.enabled) return 'none';

  const res = await fetch(`/api/tmdb?endpoint=/tv/${item.id}`);
  if (!res.ok) return 'none';
  const data = await res.json();
  const next = data.next_episode_to_air;
  if (!next?.air_date) return 'none';

  const days = daysBetween(next.air_date);
  if (days < 0 || days > DAYS_THRESHOLD) return 'none';

  const eventKey = `tv-${item.id}-s${next.season_number}e${next.episode_number}`;
  if (notifiedStore.has(eventKey)) return 'skipped';

  const rendered = renderNotificationTemplate(templates.new_episode, {
    title: item.title,
    season: next.season_number,
    episode: String(next.episode_number).padStart(2, '0'),
    episodeName: next.name || '',
    date: next.air_date,
    days: dayLabel(days),
  });
  await deliver(uid, eventKey, 'new_episode', rendered.title, rendered.body, `/title/tv/${item.id}`, item.poster_path);
  notifiedStore.mark(eventKey);
  return 'fired';
}

async function checkMovie(
  item: ListedItem,
  uid: string,
  templates: NotificationTemplates,
): Promise<CheckOutcome> {
  const prefs = prefsStore.get();
  const selectedPlatforms = prefs.streams ?? [];
  if (!isNotifEnabled(prefs, 'premieres') || !templates.streaming_available.enabled) return 'none';

  const region = (prefs.country || 'BR').toUpperCase();
  const res = await fetch(`/api/tmdb?endpoint=/movie/${item.id}/watch/providers`);
  if (!res.ok) return 'none';
  const data = await res.json();
  const flatrate = (data.results?.[region]?.flatrate ?? []) as Provider[];
  const current = Array.from(new Set(flatrate.map((provider) => provider.provider_name).filter(Boolean) as string[]));
  const snapshotId = `movie:${item.id}:${region}`;
  const snapshots = getProviderSnapshots(uid);
  const previous = snapshots[snapshotId];

  // The first successful lookup establishes the truth baseline. It must not
  // claim that an already-available movie has just arrived.
  setProviderSnapshot(uid, snapshotId, current);
  if (!previous) return 'none';

  const previousNames = new Set(previous.map(normalizeName));
  const newlyAvailable = current.filter((name) => !previousNames.has(normalizeName(name)));
  const selectedArrival = newlyAvailable.find((name) => isSelectedProvider(name, selectedPlatforms));
  if (!selectedArrival) return 'none';

  const providerKey = normalizeName(selectedArrival);
  const eventKey = `streaming-movie-${item.id}-${region}-${providerKey}`;
  if (notifiedStore.has(eventKey)) return 'skipped';

  const rendered = renderNotificationTemplate(templates.streaming_available, {
    title: item.title,
    platform: selectedArrival,
    date: new Date().toISOString().slice(0, 10),
  });
  await deliver(uid, eventKey, 'release', rendered.title, rendered.body, `/title/movie/${item.id}`, item.poster_path);
  notifiedStore.mark(eventKey);
  return 'fired';
}

async function currentTemplates(): Promise<NotificationTemplates> {
  let templates = notificationTemplateStore.get();
  if (!firebaseConfigured) return templates;
  try {
    templates = await dbNotificationTemplateStore.get(getDB());
    notificationTemplateStore.set(templates);
  } catch {}
  return templates;
}

/** Scan the signed-in user's lists. Browser permission is optional because
 * verified events are always added to the in-app inbox as well. */
export async function checkUpcomingReleases(uid = getActiveUser() ?? ''): Promise<NotifyResult> {
  const result: NotifyResult = { fired: 0, checked: 0, skipped: 0 };
  if (typeof window === 'undefined' || !uid) return result;

  const templates = await currentTemplates();
  const all = [...listStore.get('want'), ...listStore.get('watching')];
  const seen = new Set<string>();
  const items = all.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as ListedItem[];

  for (const item of items) {
    result.checked += 1;
    try {
      const outcome = item.type === 'tv'
        ? await checkTV(item, uid, templates)
        : await checkMovie(item, uid, templates);
      if (outcome === 'fired') result.fired += 1;
      if (outcome === 'skipped') result.skipped += 1;
    } catch { /* one invalid title must not stop the remaining scan */ }
  }
  return result;
}
