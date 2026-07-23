'use client';

import { notificationTemplateStore, renderNotificationTemplate } from './notificationTemplates';

export type Prefs = { genres?: string[]; streams?: string[]; notifications?: string[]; locale?: string; country?: string; notifPrefs?: Record<string, boolean> };

/* ── Notification preference keys ──
   Missing key = enabled (all notifications default ON). `notifPrefs` only
   stores explicit choices, so new categories are opt-out automatically. */
export const NOTIF_PREF_KEYS = ['mentions', 'likes', 'replies', 'followers', 'premieres', 'episodes', 'reminders'] as const;
export type NotifPrefKey = (typeof NOTIF_PREF_KEYS)[number];

export function isNotifEnabled(prefs: Prefs, key: NotifPrefKey): boolean {
  return prefs.notifPrefs?.[key] !== false;
}

const PREFS_KEY = 'sec_prefs';

/* ─── Account switching ───────────────────────────────────────
   These caches hold the signed-in user's *content* and are NOT
   uid-scoped, so they must be wiped when the account changes —
   otherwise the next user inherits (and, via migrateLocalToFirestore,
   even uploads) the previous user's lists. ─────────────────── */
const ACTIVE_UID_KEY = 'sec_active_uid';

const USER_SCOPED_KEYS = [
  'sec_lists_v1',        // want / watching / watched / favorites
  'sec_reviews_v1',      // reviews + replies
  'sec_ep_watched_v1',   // watched episodes
  'sec_prefs',           // genres / streamings / notifications
  'sec_following',       // following usernames
  'sec_blocked',         // blocked user uids
  'sec_expenses_v1',     // streaming subscriptions
  'sec_notified_releases_v1',
];

/** uid that currently owns the local cache, or null when unknown. */
export function getActiveUser(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(ACTIVE_UID_KEY); } catch { return null; }
}

/** Drop every cached per-user content key. */
export function clearUserScopedCache() {
  if (typeof window === 'undefined') return;
  for (const k of USER_SCOPED_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
}

/**
 * Record which account owns the local cache. When the uid changes from a
 * previously recorded one, the cache is wiped first.
 *
 * A *missing* previous uid is deliberately not treated as a switch: that's
 * the first login on this device, where the local data belongs to this user
 * and migrateLocalToFirestore still needs to upload it.
 *
 * Returns true when the cache was cleared.
 */
export function switchActiveUser(uid: string | null): boolean {
  if (typeof window === 'undefined') return false;
  let prev: string | null = null;
  try { prev = localStorage.getItem(ACTIVE_UID_KEY); } catch {}
  const next = uid ?? '';
  if (prev === next) return false;

  const switched = !!prev && prev !== next;
  if (switched) clearUserScopedCache();

  try {
    if (uid) localStorage.setItem(ACTIVE_UID_KEY, uid);
    else localStorage.removeItem(ACTIVE_UID_KEY);
  } catch {}
  return switched;
}

export const prefsStore = {
  get(): Prefs {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
  },
  set(p: Prefs) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
  },
};

/* ── Blocked users ──
   Stores the uids this account has blocked. Content authored by a blocked
   user is hidden in the feed and comments. Cloud copy lives on the owner's
   own doc (users/{uid}.blocked_list); this cache is uid-scoped-wiped on
   account switch. Blocking is unilateral and private. */
const BLOCKED_KEY = 'sec_blocked';

export const blockStore = {
  get(): string[] {
    if (typeof window === 'undefined') return [];
    try { const v = JSON.parse(localStorage.getItem(BLOCKED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  },
  set(list: string[]) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(BLOCKED_KEY, JSON.stringify(Array.from(new Set(list)))); } catch {}
  },
  isBlocked(uid?: string | null): boolean {
    if (!uid) return false;
    return blockStore.get().includes(uid);
  },
  add(uid: string) {
    if (!uid) return;
    blockStore.set([...blockStore.get(), uid]);
  },
  remove(uid: string) {
    blockStore.set(blockStore.get().filter(u => u !== uid));
  },
};

export type Review = {
  id: string; user: string; uid?: string; avatar: string; photoUrl?: string; rating: number; text: string;
  gifUrl?: string; imageUrl?: string; reaction?: string; spoiler?: boolean; date: string; likes?: number; likedBy?: string[];
  replies?: Array<{ id: string; uid?: string; user: string; avatar: string; photoUrl?: string; text: string; date: string; likes?: number; likedBy?: string[] }>;
};

const REV_KEY = 'sec_reviews_v1';

export const revStore = {
  get(itemKey: string): Review[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(REV_KEY) || '{}')[itemKey] || []; } catch { return []; }
  },
  set(itemKey: string, reviews: Review[]) {
    if (typeof window === 'undefined') return;
    try {
      const all = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      all[itemKey] = reviews;
      localStorage.setItem(REV_KEY, JSON.stringify(all));
    } catch {}
  },
  addReview(itemKey: string, review: Review) {
    const list = revStore.get(itemKey);
    list.unshift(review);
    revStore.set(itemKey, list);
    return list;
  },
  removeReview(itemKey: string, reviewId: string) {
    const updated = revStore.get(itemKey).filter(review => review.id !== reviewId);
    revStore.set(itemKey, updated);
    return updated;
  },
  countAll(): number {
    if (typeof window === 'undefined') return 0;
    try {
      const all = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      return Object.values(all).reduce((sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    } catch { return 0; }
  },
  /** Returns all reviews across ALL keys that belong to a given username */
  getByUser(username: string): Array<Review & { itemKey: string }> {
    if (typeof window === 'undefined') return [];
    try {
      const all: Record<string, Review[]> = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
      const result: Array<Review & { itemKey: string }> = [];
      for (const [key, reviews] of Object.entries(all)) {
        if (!Array.isArray(reviews)) continue;
        for (const r of reviews) {
          if (r.user === username) result.push({ ...r, itemKey: key });
        }
      }
      return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch { return []; }
  },
  toggleLike(itemKey: string, reviewId: string, userId = 'me') {
    const list = revStore.get(itemKey);
    const rev = list.find((r) => r.id === reviewId);
    if (!rev) return list;
    rev.likedBy = rev.likedBy || [];
    const idx = rev.likedBy.indexOf(userId);
    if (idx >= 0) rev.likedBy.splice(idx, 1); else rev.likedBy.push(userId);
    rev.likes = rev.likedBy.length;
    revStore.set(itemKey, list);
    return list;
  },
};

/* ─── Watched episodes store ────────────────────────────────
   Format: { [tmdbTvId: string]: { [season: string]: number[] } }
   Key: localStorage 'sec_ep_watched_v1'
─────────────────────────────────────────────────────────── */
const EP_KEY = 'sec_ep_watched_v1';

export const epWatchedStore = {
  getAll(): Record<string, Record<string, number[]>> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(EP_KEY) || '{}'); } catch { return {}; }
  },
  getShow(tvId: string | number): Record<string, number[]> {
    return epWatchedStore.getAll()[String(tvId)] ?? {};
  },
  isWatched(tvId: string | number, season: number, epNum: number): boolean {
    const show = epWatchedStore.getShow(tvId);
    return (show[String(season)] ?? []).includes(epNum);
  },
  markWatched(tvId: string | number, season: number, epNum: number) {
    const all  = epWatchedStore.getAll();
    const id   = String(tvId);
    const s    = String(season);
    if (!all[id])    all[id]    = {};
    if (!all[id][s]) all[id][s] = [];
    if (!all[id][s].includes(epNum)) all[id][s].push(epNum);
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
  unmarkWatched(tvId: string | number, season: number, epNum: number) {
    const all = epWatchedStore.getAll();
    const id  = String(tvId);
    const s   = String(season);
    if (!all[id]?.[s]) return;
    all[id][s] = all[id][s].filter((n) => n !== epNum);
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
  setShow(tvId: string | number, data: Record<string, number[]>) {
    const all = epWatchedStore.getAll();
    all[String(tvId)] = data;
    try { localStorage.setItem(EP_KEY, JSON.stringify(all)); } catch {}
  },
};

/* ─── Profile store ─── */
export type Profile = {
  name: string;
  username: string;
  bio: string;
  avatarLetter: string;
  avatarGradient: string;
  avatarImage: string;   // Firebase Storage URL (legacy base64 may still exist until migration)
  /** Small public avatar used by feeds, comments and follower lists. */
  avatarThumbImage?: string;
  coverImage: string;    // Firebase Storage URL (legacy base64 may still exist until migration)
  social: { instagram: string; twitter: string; letterboxd: string };
  streamings: string[];
  genres: string[];
  followers: number;
  following: number;
  /** Previous usernames — keeps old /user/<slug> links resolvable. */
  aliases?: string[];
  /** True once the username has been derived from the name. */
  usernameMigrated?: boolean;
  /** True when the user picked the username by hand — never auto-derive again. */
  usernameCustom?: boolean;
  /** Visual PRO marker for the current prototype. Never use this client-writable field as billing authorization. */
  proMember?: boolean;
  /** Public visual theme used by the PRO profile header. */
  proTheme?: ProProfileTheme;
  /** Public monthly emblems. Their final visual taxonomy is still evolving. */
  proBadges?: string[];
  /** Server-maintained derived values. Clients must never write this map. */
  counters?: ProfileCounters;
};

export type ProfileCounters = {
  followersCount: number;
  followingCount: number;
  commentsCount: number;
  ratingsCount: number;
  listsCount: number;
  watchedCount: number;
};

export const EMPTY_PROFILE_COUNTERS: ProfileCounters = {
  followersCount: 0,
  followingCount: 0,
  commentsCount: 0,
  ratingsCount: 0,
  listsCount: 0,
  watchedCount: 0,
};

export type ProProfileTheme = {
  id: string;
  title: string;
  posterPath?: string | null;
  accent: string;
  gradient: string;
};

export const DEFAULT_PRO_THEME: ProProfileTheme = {
  id: 'maratonou',
  title: 'Maratonou',
  accent: '#C069FF',
  gradient: 'linear-gradient(145deg,#28143f 0%,#130d20 55%,#08080c 100%)',
};

export const PROFILE_KEY_BASE = 'sec_profile_v1';
export function profileKey(uid?: string | null) {
  return uid ? `${PROFILE_KEY_BASE}_${uid}` : PROFILE_KEY_BASE;
}

const PROFILE_DEFAULT: Profile = {
  name: '',
  username: '',
  bio: '',
  avatarLetter: '',
  avatarGradient: 'linear-gradient(135deg,#C069FF,#c030a0)',
  avatarImage: '',
  avatarThumbImage: '',
  coverImage: '',
  social: { instagram: '', twitter: '', letterboxd: '' },
  streamings: [],
  genres: [],
  followers: 0,
  following: 0,
  aliases: [],
  usernameMigrated: false,
  usernameCustom: false,
  proMember: false,
  proTheme: DEFAULT_PRO_THEME,
  proBadges: [],
  counters: EMPTY_PROFILE_COUNTERS,
};

export const profileStore = {
  get(uid?: string | null): Profile {
    if (typeof window === 'undefined') return PROFILE_DEFAULT;
    const key = profileKey(uid);
    try { return { ...PROFILE_DEFAULT, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return PROFILE_DEFAULT; }
  },
  set(p: Partial<Profile>, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = profileKey(uid);
    try { localStorage.setItem(key, JSON.stringify({ ...profileStore.get(uid), ...p })); } catch {}
  },
  clear(uid?: string | null) {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(profileKey(uid)); } catch {}
  },
};

/* ─── PRO preferences (private, uid-scoped) ──────────────────
   Public profile appearance lives in Profile. Home composition and dated
   reminders stay in this per-account store so one member never changes the
   experience of another account on the same device. ─────────────────── */
export const PRO_HOME_SECTION_KEYS = [
  'hero', 'watching', 'recommendedSeries', 'recommendedMovies', 'streamings', 'news',
] as const;
export type ProHomeSectionKey = (typeof PRO_HOME_SECTION_KEYS)[number];
export type ProHomeSections = Record<ProHomeSectionKey, boolean>;

export type ProReminder = {
  id: string;
  listId?: string;
  listName: string;
  title: string;
  mediaType: 'tv' | 'movie';
  remindAt: string;
  createdAt: string;
  tmdbId?: number;
  posterPath?: string | null;
  notifiedAt?: string;
};

export type ProCustomList = {
  id: string;
  name: string;
  notificationsEnabled: boolean;
  createdAt: string;
};

export type ProSettings = {
  homeSections: ProHomeSections;
  customLists: ProCustomList[];
  reminders: ProReminder[];
};

export const DEFAULT_PRO_HOME_SECTIONS: ProHomeSections = {
  hero: true,
  watching: true,
  recommendedSeries: true,
  recommendedMovies: true,
  streamings: true,
  news: true,
};

export const DEFAULT_PRO_SETTINGS: ProSettings = {
  homeSections: DEFAULT_PRO_HOME_SECTIONS,
  customLists: [],
  reminders: [],
};

export const PRO_SETTINGS_KEY_BASE = 'sec_pro_settings_v1';
export const proSettingsKey = (uid?: string | null) => `${PRO_SETTINGS_KEY_BASE}_${uid ?? ''}`;

export const proSettingsStore = {
  get(uid?: string | null): ProSettings {
    if (typeof window === 'undefined') return DEFAULT_PRO_SETTINGS;
    try {
      const parsed = JSON.parse(localStorage.getItem(proSettingsKey(uid)) || '{}') as Partial<ProSettings>;
      const reminders = Array.isArray(parsed.reminders) ? parsed.reminders : [];
      const customLists = Array.isArray(parsed.customLists)
        ? parsed.customLists.map((list) => ({ ...list, notificationsEnabled: list.notificationsEnabled !== false }))
        : [];
      for (const reminder of reminders) {
        if (!customLists.some((list) => list.id === reminder.listId || list.name.toLocaleLowerCase() === reminder.listName.toLocaleLowerCase())) {
          customLists.push({
            id: reminder.listId || `legacy_${reminder.listName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            name: reminder.listName,
            notificationsEnabled: true,
            createdAt: reminder.createdAt,
          });
        }
      }
      return {
        homeSections: { ...DEFAULT_PRO_HOME_SECTIONS, ...(parsed.homeSections ?? {}) },
        customLists,
        reminders: reminders.map((reminder) => ({
          ...reminder,
          listId: reminder.listId || customLists.find((list) => list.name.toLocaleLowerCase() === reminder.listName.toLocaleLowerCase())?.id,
        })),
      };
    } catch { return DEFAULT_PRO_SETTINGS; }
  },
  set(settings: Partial<ProSettings>, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const current = proSettingsStore.get(uid);
    const next: ProSettings = {
      ...current,
      ...settings,
      homeSections: { ...current.homeSections, ...(settings.homeSections ?? {}) },
      customLists: settings.customLists ?? current.customLists,
      reminders: settings.reminders ?? current.reminders,
    };
    try {
      localStorage.setItem(proSettingsKey(uid), JSON.stringify(next));
      window.dispatchEvent(new Event('maratonou:pro'));
    } catch {}
  },
};

export const SAMPLE_REVIEWS: Review[] = [
  { id: 'r1', user: 'Ana Lima', avatar: 'AL', rating: 9, text: 'Uma das melhores séries dos últimos anos. Atuações impecáveis!', date: '20 abr 2025', likes: 12, likedBy: [], replies: [] },
  { id: 'r2', user: 'Marcos Pinto', avatar: 'MP', rating: 8, text: 'Excelente roteiro. Alguns momentos da terceira temporada são lentos, mas compensa no final.', date: '15 abr 2025', likes: 7, likedBy: [], replies: [] },
  { id: 'r3', user: 'Julia Souza', avatar: 'JS', rating: 10, text: 'Obra-prima absoluta. Recomendo para todos!', date: '10 abr 2025', likes: 24, likedBy: [], replies: [] },
];


/* ─── Home slider store (admin-curated) ─── */
export type SliderCategory = 'nos_cinemas' | 'no_streaming' | 'em_breve' | null;

export interface SliderItem {
  id: number;
  title: string;
  type: 'movie' | 'tv';
  backdrop_path: string | null;
  poster_path:   string | null;
  overview:      string;
  buttonText:    string;       // e.g. "Quero ver", "Assistir agora"
  category:      SliderCategory; // badge shown on the card
}

const SLIDER_KEY = 'sec_admin_slider_v1';

export const sliderStore = {
  get(): SliderItem[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(SLIDER_KEY) || '[]'); } catch { return []; }
  },
  set(items: SliderItem[]) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(SLIDER_KEY, JSON.stringify(items)); } catch {}
  },
};


/* ─── Notified releases store (avoids duplicate notifications) ─── */
const NOTIFIED_KEY = 'sec_notified_releases_v1';

export const notifiedStore = {
  get(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); } catch { return {}; }
  },
  set(data: Record<string, string>) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(data)); } catch {}
  },
  has(key: string): boolean {
    return key in notifiedStore.get();
  },
  mark(key: string) {
    const all = notifiedStore.get();
    all[key] = new Date().toISOString();
    notifiedStore.set(all);
  },
  clear() {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(NOTIFIED_KEY); } catch {}
  },
};

type ListType = 'want' | 'watching' | 'watched' | 'favorites';
const LIST_KEY = 'sec_lists_v1';

export const listStore = {
  get(type: ListType): Array<{ id: number; title: string; type: string; poster_path?: string | null }> {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}')[type] || []; } catch { return []; }
  },
  add(type: ListType, item: { id: number; title: string; type: string; poster_path?: string | null }) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; } })();
    const cur = all[type] || [];
    if (!cur.some((x: any) => x.id === item.id)) cur.unshift(item);
    all[type] = cur;
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    return cur;
  },
  remove(type: ListType, id: number) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; } })();
    all[type] = (all[type] || []).filter((x: any) => x.id !== id);
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    return all[type];
  },
};

/* ─── Feed reactions store (local mirror of Firestore reactions) ───
   Shape: { [feedItemId]: { [uid]: emoji } }
   localStorage primary so reactions survive refresh even when the
   shared Firestore `reactions` collection isn't writable. ─────── */
const REACTIONS_KEY = 'sec_reactions_v1';

export const reactionStore = {
  getMap(feedItemId: string): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(REACTIONS_KEY) || '{}')[feedItemId] || {}; } catch { return {}; }
  },
  set(feedItemId: string, uid: string, emoji: string | null) {
    if (typeof window === 'undefined') return;
    try {
      const all = JSON.parse(localStorage.getItem(REACTIONS_KEY) || '{}');
      all[feedItemId] = all[feedItemId] || {};
      if (emoji === null) delete all[feedItemId][uid];
      else all[feedItemId][uid] = emoji;
      localStorage.setItem(REACTIONS_KEY, JSON.stringify(all));
    } catch {}
  },
};

/* ─── Notification inbox store ─── */
export type InboxNotif = {
  id: string;
  type: 'new_episode' | 'like' | 'reply' | 'follow' | 'release' | 'pro_reminder' | 'general';
  title: string;
  body: string;
  time: string;    // ISO date
  read: boolean;
  link?: string;   // optional route to open on tap
  poster?: string; // TMDB poster image URL
  cloudId?: string; // Firestore app_notifications document id
};

// Per-user key: sec_notif_inbox_v1_<uid>
// When uid is absent the key resolves to 'sec_notif_inbox_v1_' which
// contains no data — unauthenticated callers always see an empty inbox.
const inboxKey = (uid?: string | null) => `sec_notif_inbox_v1_${uid ?? ''}`;

// Legacy unscoped key written by the old code — kept only for cleanup.
const INBOX_KEY_LEGACY = 'sec_notif_inbox_v1';

const INBOX_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function readInbox(uid?: string | null): InboxNotif[] {
  if (typeof window === 'undefined') return [];
  const key = inboxKey(uid);
  try {
    const all: InboxNotif[] = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();
    const filtered = all.filter(n => now - new Date(n.time).getTime() < INBOX_TTL);
    if (filtered.length !== all.length) localStorage.setItem(key, JSON.stringify(filtered));
    return filtered.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } catch { return []; }
}

export const notifInboxStore = {
  get(uid?: string | null): InboxNotif[] { return readInbox(uid); },
  add(n: InboxNotif, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all: InboxNotif[] = JSON.parse(localStorage.getItem(key) || '[]');
      // Keep the original read state/time when the same reminder is checked
      // again from a stale cloud snapshot.
      if (all.some((item) => item.id === n.id)) return;
      localStorage.setItem(key, JSON.stringify([n, ...all]));
    } catch {}
  },
  markRead(id: string, uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all = readInbox(uid).map(n => n.id === id ? { ...n, read: true } : n);
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },
  markAllRead(uid?: string | null) {
    if (typeof window === 'undefined') return;
    const key = inboxKey(uid);
    try {
      const all = readInbox(uid).map(n => ({ ...n, read: true }));
      localStorage.setItem(key, JSON.stringify(all));
    } catch {}
  },
  unreadCount(uid?: string | null): number {
    return readInbox(uid).filter(n => !n.read).length;
  },
  clear(uid?: string | null) {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(inboxKey(uid)); } catch {}
  },
  /** Remove the unscoped legacy key that caused cross-account bleed. */
  clearLegacy() {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(INBOX_KEY_LEGACY); } catch {}
  },
};

/**
 * Creates the in-app reminder once a dated PRO item is within three days.
 * It is intentionally idempotent: notifiedAt is persisted with the reminder,
 * so opening Home and Notifications cannot create duplicates.
 */
export function syncProReminderNotifications(uid?: string | null): ProSettings | null {
  if (typeof window === 'undefined' || !uid) return null;
  if (!isNotifEnabled(prefsStore.get(), 'reminders')) return null;
  const settings = proSettingsStore.get(uid);
  const now = Date.now();
  const soon = now + 3 * 24 * 60 * 60 * 1000;
  const oldest = now - 7 * 24 * 60 * 60 * 1000;
  let changed = false;
  const reminders = settings.reminders.map((reminder) => {
    const customList = settings.customLists.find((list) => list.id === reminder.listId);
    if (customList?.notificationsEnabled === false) return reminder;
    const due = new Date(`${reminder.remindAt}T12:00:00`).getTime();
    if (reminder.notifiedAt || Number.isNaN(due) || due > soon || due < oldest) return reminder;

    const template = notificationTemplateStore.get().pro_reminder;
    if (!template.enabled) return reminder;
    const rendered = renderNotificationTemplate(template, {
      title: reminder.title,
      listName: reminder.listName,
      date: reminder.remindAt,
      days: Math.max(0, Math.ceil((due - now) / (24 * 60 * 60 * 1000))),
    });
    notifInboxStore.add({
      id: `pro_reminder_${reminder.id}`,
      type: 'pro_reminder',
      title: rendered.title,
      body: rendered.body,
      time: new Date().toISOString(),
      read: false,
      poster: reminder.posterPath || undefined,
      link: reminder.tmdbId ? `/title/${reminder.mediaType}/${reminder.tmdbId}` : '/settings/pro',
    }, uid);
    changed = true;
    return { ...reminder, notifiedAt: new Date().toISOString() };
  });

  if (!changed) return null;
  const next = { ...settings, reminders };
  proSettingsStore.set(next, uid);
  return next;
}
