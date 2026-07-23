/* ─────────────────────────────────────────────────────────────
   Firestore data layer — mirrors the localStorage store.ts API
   so components can swap between local and cloud storage.

   Firestore structure:
     users/{uid}/profile    — Profile doc
     users/{uid}/lists      — { want, watching, watched }
     users/{uid}/prefs      — Prefs
     users/{uid}/fcm_tokens — { tokens: string[] }
     reviews/{titleKey}     — { items: Review[] }
     config/slider          — { items: SliderItem[] }
   ───────────────────────────────────────────────────────────── */
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, increment, writeBatch,
  collection, addDoc, getDocs, deleteDoc, query, orderBy, limit, onSnapshot, where,
  deleteField, startAfter, runTransaction, serverTimestamp,
  type Firestore, type Unsubscribe, type QueryDocumentSnapshot, type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { EMPTY_PROFILE_COUNTERS, type Profile, type Review, type SliderItem, type Prefs, type ProSettings } from './store';
import type { InboxNotif } from './store';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  normalizeNotificationTemplates,
  type NotificationTemplates,
} from './notificationTemplates';
import { profileKey, proSettingsKey } from './store';
import { slugifyUsername, usernameFromNameOrEmail, usernameCandidate, USERNAME_FALLBACK } from './username';
import { cachedRequest, invalidateCache } from './cache';
import { CACHE_TTL, FIRESTORE_PAGE_SIZE, boundedPageSize } from './dataPolicy';
import { dataCostDebug } from './devDataMetrics';

type ListType = 'want' | 'watching' | 'watched' | 'favorites';
type ListItem = { id: number; title: string; type: string; poster_path?: string | null };

// ── helpers ─────────────────────────────────────────────────

async function getField<T>(db: Firestore, path: string[], field: string, fallback: T): Promise<T> {
  try {
    const snap = await getDoc(doc(db, ...path as [string, string, ...string[]]));
    const data = snap.data();
    return (data?.[field] ?? fallback) as T;
  } catch { return fallback; }
}

async function setField(db: Firestore, path: string[], field: string, value: unknown) {
  await setDoc(doc(db, ...path as [string, string, ...string[]]), { [field]: value }, { merge: true });
}

// ── Profile ──────────────────────────────────────────────────

const PROFILE_DEFAULT: Profile = {
  name: '', username: '', bio: '',
  avatarLetter: '', avatarGradient: '', avatarImage: '', avatarThumbImage: '', coverImage: '',
  social: { instagram: '', twitter: '', letterboxd: '' },
  streamings: [], genres: [],
  followers: 0, following: 0,
  proMember: false,
  proBadges: [],
  counters: EMPTY_PROFILE_COUNTERS,
};

export const dbProfileStore = {
  async getOptional(db: Firestore, uid: string): Promise<Profile | null> {
    return cachedRequest(`profile:${uid}`, CACHE_TTL.publicProfile, async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        dataCostDebug.query('profile:get', snap.exists() ? 1 : 0);
        const data = snap.data();
        const profile = data?.profile;
        return profile && typeof profile === 'object'
          ? {
              ...PROFILE_DEFAULT,
              ...profile,
              counters: { ...EMPTY_PROFILE_COUNTERS, ...(data?.counters ?? {}) },
            } as Profile
          : null;
      } catch { return null; }
    }, { staleIfError: true });
  },
  async get(db: Firestore, uid: string): Promise<Profile> {
    return (await dbProfileStore.getOptional(db, uid)) ?? PROFILE_DEFAULT;
  },
  async set(db: Firestore, uid: string, p: Partial<Profile>) {
    const current = (await dbProfileStore.getOptional(db, uid)) ?? PROFILE_DEFAULT;
    const { counters: _derivedCounters, ...safeProfile } = { ...current, ...p };
    await setField(db, ['users', uid], 'profile', safeProfile);
    invalidateCache(`profile:${uid}`);
  },
};

export type UserSearchResult = {
  uid: string;
  name: string;
  username: string;
  avatarLetter: string;
  avatarGradient: string;
  avatarImage: string;
  bio: string;
};

export async function searchUsers(db: Firestore, q: string): Promise<UserSearchResult[]> {
  if (!q) return [];
  const lower = q.toLowerCase();
  try {
    const snap = await getDocs(
      query(collection(db, 'users'),
        where('profile.username', '>=', lower),
        where('profile.username', '<=', lower + ''),
        limit(20))
    );
    const byUsername = snap.docs.map(d => {
      const p = d.data()?.profile ?? {};
      return { uid: d.id, name: p.name || '', username: p.username || '', avatarLetter: p.avatarLetter || '', avatarGradient: p.avatarGradient || '', avatarImage: p.avatarImage || '', bio: p.bio || '' };
    }).filter(u => u.username);

    // Also search by name if username search returned nothing
    if (byUsername.length === 0) {
      const snap2 = await getDocs(
        query(collection(db, 'users'),
          where('profile.name', '>=', q),
          where('profile.name', '<=', q + ''),
          limit(20))
      );
      return snap2.docs.map(d => {
        const p = d.data()?.profile ?? {};
        return { uid: d.id, name: p.name || '', username: p.username || '', avatarLetter: p.avatarLetter || '', avatarGradient: p.avatarGradient || '', avatarImage: p.avatarImage || '', bio: p.bio || '' };
      }).filter(u => u.name);
    }
    return byUsername;
  } catch { return []; }
}

export async function getUserByUsername(
  db: Firestore, username: string,
): Promise<{ uid: string; profile: Profile; followingCount: number } | null> {
  const build = (d: { id: string; data: () => any }) => ({
    uid: d.id,
    profile: {
      ...PROFILE_DEFAULT,
      ...(d.data()?.profile ?? {}),
      counters: { ...EMPTY_PROFILE_COUNTERS, ...(d.data()?.counters ?? {}) },
    } as Profile,
    followingCount: Number(
      d.data()?.counters?.followingCount
      ?? (d.data()?.following_list ?? []).length
      ?? 0,
    ),
  });
  const tryQuery = async (field: string, op: '==' | 'array-contains', value: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where(field, op as any, value), limit(1))
      );
      return snap.empty ? null : build(snap.docs[0]);
    } catch { return null; }
  };

  // 1. Canonical username
  const byUsername = await tryQuery('profile.username', '==', username);
  if (byUsername) return byUsername;
  // 2. Previous username (kept when the slug migration renamed the account)
  const byAlias = await tryQuery('profile.aliases', 'array-contains', username);
  if (byAlias) return byAlias;
  // 3. Display name — legacy feed/activity links carry the displayName
  const byName = await tryQuery('profile.name', '==', username);
  if (byName) return byName;
  // 4. A uid was passed instead of a username (e.g. from /search)
  try {
    const snap = await getDoc(doc(db, 'users', username));
    if (snap.exists()) return build(snap as any);
  } catch { /* ignore */ }
  return null;
}

/** True when the username already belongs to a different account. */
export async function isUsernameTaken(db: Firestore, username: string, exceptUid?: string): Promise<boolean> {
  if (!username) return false;
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('profile.username', '==', username), limit(2))
    );
    return snap.docs.some(d => d.id !== exceptUid);
  } catch {
    return false; // can't verify (rules/offline) — don't block the user
  }
}

/**
 * First free username in the base, base-2, base-3 … sequence.
 * Degrades to `base` when the uniqueness query can't run.
 */
export async function resolveUniqueUsername(db: Firestore, base: string, exceptUid?: string): Promise<string> {
  const safeBase = base || USERNAME_FALLBACK;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const candidate = usernameCandidate(safeBase, attempt);
    if (!(await isUsernameTaken(db, candidate, exceptUid))) return candidate;
  }
  return `${safeBase}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * One-time migration: derive the username from the user's Name.
 * The old username is kept in `profile.aliases` so previously shared
 * /user/<old> links still resolve. Runs once per account, and never
 * overwrites a username the user set by hand (usernameMigrated).
 */
export async function migrateUsernameToSlug(
  db: Firestore,
  uid: string,
  authName?: string | null,
  email?: string | null,
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const profile = (snap.data()?.profile ?? {}) as Profile;
    const current = profile.username || '';

    // A username the user picked by hand is final.
    if (profile.usernameCustom) return current || null;

    // Some accounts never stored a name — backfill it from the auth
    // displayName so the profile renders and the slug can be derived.
    const name = profile.name || authName || '';

    // Derive from the Name, then the email prefix. Never the generic
    // fallback: an account with nothing to slug keeps what it has.
    const base =
      slugifyUsername(name) ||
      slugifyUsername((email || '').split('@')[0]);

    const nameChanged = !profile.name && !!name;
    if (!base || current === base) {
      if (nameChanged || !profile.usernameMigrated) {
        await setField(db, ['users', uid], 'profile', {
          ...profile, ...(nameChanged ? { name } : {}), usernameMigrated: true,
        });
      }
      return current || null;
    }

    const next = await resolveUniqueUsername(db, base, uid);
    // Keep old usernames resolvable, but never the generic fallback —
    // several accounts may have been given it.
    const aliases = Array.from(new Set(
      [...(profile.aliases ?? []), current].filter(a => a && a !== USERNAME_FALLBACK)
    ));
    await setField(db, ['users', uid], 'profile', {
      ...profile,
      ...(nameChanged ? { name } : {}),
      username: next, aliases, usernameMigrated: true,
    });
    return next;
  } catch { return null; }
}

// ── Lists ────────────────────────────────────────────────────

export const dbListStore = {
  async get(db: Firestore, uid: string, type: ListType): Promise<ListItem[]> {
    return getField<ListItem[]>(db, ['users', uid], `lists_${type}`, []);
  },
  async add(db: Firestore, uid: string, type: ListType, item: ListItem) {
    const current = await dbListStore.get(db, uid, type);
    if (current.some((x) => x.id === item.id)) return current;
    const updated = [item, ...current];
    await setField(db, ['users', uid], `lists_${type}`, updated);
    return updated;
  },
  async remove(db: Firestore, uid: string, type: ListType, id: number) {
    const current = await dbListStore.get(db, uid, type);
    const updated = current.filter((x) => x.id !== id);
    await setField(db, ['users', uid], `lists_${type}`, updated);
    return updated;
  },
};

// ── Reviews ──────────────────────────────────────────────────

// New model: reviews/{titleKey}/items/{reviewId} — ONE DOC PER REVIEW.
// Each doc carries authorUid so the security rules can hold every review to
// its author (create/delete). The old model (a single shared `items` array on
// reviews/{titleKey}) could not be protected: any signed-in user could rewrite
// everyone's comments, and two simultaneous writers silently dropped one.
// Legacy array docs are merged into reads as read-only history; writes only
// ever touch the subcollection.

const revCol = (db: Firestore, titleKey: string) => collection(db, 'reviews', titleKey, 'items');
const reviewIsVisible = (review: Review) => !(review as Review & { moderation?: { hidden?: boolean } }).moderation?.hidden;

export type ReviewPageCursor =
  | { source: 'firestore'; document: QueryDocumentSnapshot<DocumentData> }
  | { source: 'legacy'; offset: number; items: Review[] };

export type FirestorePage<T, Cursor> = {
  items: T[];
  cursor: Cursor | null;
  hasMore: boolean;
};

/** Firestore rejects `undefined` values — strip them via JSON round-trip. */
const stripUndefined = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const dbRevStore = {
  async getPage(
    db: Firestore,
    titleKey: string,
    cursor: ReviewPageCursor | null = null,
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<FirestorePage<Review, ReviewPageCursor>> {
    const pageSize = boundedPageSize(requestedSize);

    // Legacy documents keep their already-read array in the cursor. This is
    // intentionally a compatibility path: it avoids downloading the same
    // oversized document for every page until the migration is executed.
    if (cursor?.source === 'legacy') {
      const items = cursor.items.slice(cursor.offset, cursor.offset + pageSize);
      const nextOffset = cursor.offset + items.length;
      return {
        items,
        cursor: items.length ? { ...cursor, offset: nextOffset } : null,
        hasMore: nextOffset < cursor.items.length,
      };
    }

    try {
      const constraints: QueryConstraint[] = [orderBy('date', 'desc')];
      if (cursor?.source === 'firestore') constraints.push(startAfter(cursor.document));
      constraints.push(limit(pageSize));
      const snap = await getDocs(query(revCol(db, titleKey), ...constraints));
      dataCostDebug.query('reviews:page', snap.size);
      if (!snap.empty) {
        return {
          items: snap.docs.map((entry) => entry.data() as Review).filter(reviewIsVisible),
          cursor: { source: 'firestore', document: snap.docs[snap.docs.length - 1] },
          hasMore: snap.size === pageSize,
        };
      }

      // Only the first page may fall back to the read-only array model.
      if (!cursor) {
        const legacySnap = await getDoc(doc(db, 'reviews', titleKey));
        dataCostDebug.query('reviews:legacy-fallback', legacySnap.exists() ? 1 : 0);
        const legacy = ((legacySnap.data()?.items ?? []) as Review[])
          .filter(reviewIsVisible)
          .slice()
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const items = legacy.slice(0, pageSize);
        return {
          items,
          cursor: items.length ? { source: 'legacy', offset: items.length, items: legacy } : null,
          hasMore: legacy.length > items.length,
        };
      }
    } catch (error) {
      if (!cursor) {
        const legacy = (await getField<Review[]>(db, ['reviews', titleKey], 'items', [])).filter(reviewIsVisible);
        const sorted = legacy.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const items = sorted.slice(0, pageSize);
        return {
          items,
          cursor: items.length ? { source: 'legacy', offset: items.length, items: sorted } : null,
          hasMore: sorted.length > items.length,
        };
      }
      throw error;
    }
    return { items: [], cursor: null, hasMore: false };
  },

  async get(db: Firestore, titleKey: string): Promise<Review[]> {
    return (await dbRevStore.getPage(db, titleKey)).items;
  },

  /** `review.uid` must be the signed-in user's uid — the rules verify it. */
  async add(db: Firestore, titleKey: string, review: Review) {
    if (!review.uid) return; // signed out → review stays local-only
    await setDoc(
      doc(revCol(db, titleKey), review.id),
      stripUndefined({ ...review, authorUid: review.uid }),
    );
    if (review.rating > 0) {
      await dbRatingStore.set(db, titleKey, review.uid, review.rating, review.id);
    }
  },

  /** Remove a review from the current per-document model or from the legacy
      array model. Legacy documents must be migrated before client deletion;
      administrative moderation goes through the central API.
      Returning the source lets callers distinguish a real deletion from an
      already-missing/local-only review. Firestore errors intentionally bubble
      up so the UI never reports a false success. */
  async remove(
    db: Firestore,
    titleKey: string,
    reviewId: string,
  ): Promise<'item' | 'legacy' | 'missing'> {
    const itemRef   = doc(revCol(db, titleKey), reviewId);
    const legacyRef = doc(db, 'reviews', titleKey);
    const itemSnap  = await getDoc(itemRef);

    if (itemSnap.exists()) {
      const item = itemSnap.data() as Review & { authorUid?: string };
      await deleteDoc(itemRef);
      if (item.rating > 0 && item.authorUid) {
        await dbRatingStore.removeIfSource(db, titleKey, item.authorUid, reviewId);
      }
      return 'item';
    }

    const legacySnap  = await getDoc(legacyRef);
    const legacyItems = (legacySnap.data()?.items ?? []) as Review[];
    const updated     = legacyItems.filter(review => review.id !== reviewId);

    if (updated.length === legacyItems.length) return 'missing';

    await updateDoc(legacyRef, { items: stripUndefined(updated) });
    return 'legacy';
  },

  /** Append a reply to a review (possibly someone else's — the rules allow
      third parties to touch only likes/replies). False → legacy-only review. */
  async addReply(
    db: Firestore, titleKey: string, reviewId: string,
    reply: NonNullable<Review['replies']>[number],
  ): Promise<boolean> {
    try {
      const ref = doc(revCol(db, titleKey), reviewId);
      await updateDoc(ref, { replies: arrayUnion(stripUndefined(reply)) });
      return true;
    } catch { return false; }
  },

  /** Toggle a like. Null → legacy-only review, caller keeps its local state. */
  async toggleLike(
    db: Firestore, titleKey: string, reviewId: string, userId: string,
  ): Promise<Review[] | null> {
    try {
      const ref  = doc(revCol(db, titleKey), reviewId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const likedBy = (((snap.data() as Review).likedBy) ?? []).slice();
      const idx = likedBy.indexOf(userId);
      if (idx >= 0) likedBy.splice(idx, 1); else likedBy.push(userId);
      await updateDoc(ref, { likedBy, likes: likedBy.length });
      return dbRevStore.get(db, titleKey);
    } catch { return null; }
  },
};

// ── One active rating per user/title + aggregate summary ─────

export type RatingSummary = {
  titleId: string;
  average: number;
  total: number;
  sum: number;
  distribution: Record<string, number>;
  updatedAt?: unknown;
};

const EMPTY_RATING_SUMMARY = (titleKey: string): RatingSummary => ({
  titleId: titleKey,
  average: 0,
  total: 0,
  sum: 0,
  distribution: {},
});

const ratingRef = (db: Firestore, titleKey: string, uid: string) =>
  doc(db, 'ratings', titleKey, 'userRatings', uid);

export const dbRatingStore = {
  async set(db: Firestore, titleKey: string, uid: string, rawRating: number, sourceReviewId?: string) {
    if (!uid) return;
    const rating = Math.max(1, Math.min(10, Math.round(rawRating)));
    const ref = ratingRef(db, titleKey, uid);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      transaction.set(ref, stripUndefined({
        titleId: titleKey,
        authorUid: uid,
        rating,
        sourceReviewId,
        updatedAt: serverTimestamp(),
        ...(!current.exists() ? { createdAt: serverTimestamp() } : {}),
      }), { merge: true });
    });
    invalidateCache(`rating-summary:${titleKey}`);
  },
  async removeIfSource(db: Firestore, titleKey: string, uid: string, sourceReviewId: string) {
    const ref = ratingRef(db, titleKey, uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists() && snap.data()?.sourceReviewId === sourceReviewId) transaction.delete(ref);
    });
    invalidateCache(`rating-summary:${titleKey}`);
  },
};

export const dbRatingSummaryStore = {
  async get(db: Firestore, titleKey: string): Promise<RatingSummary> {
    return cachedRequest(`rating-summary:${titleKey}`, CACHE_TTL.ratingSummary, async () => {
      const snap = await getDoc(doc(db, 'ratingSummaries', titleKey));
      dataCostDebug.query('rating-summary:get', snap.exists() ? 1 : 0);
      return snap.exists()
        ? { ...EMPTY_RATING_SUMMARY(titleKey), ...snap.data() } as RatingSummary
        : EMPTY_RATING_SUMMARY(titleKey);
    }, { staleIfError: true });
  },
};

// ── Prefs ────────────────────────────────────────────────────

export const dbPrefsStore = {
  async get(db: Firestore, uid: string): Promise<Prefs> {
    return getField<Prefs>(db, ['users', uid], 'prefs', {});
  },
  async set(db: Firestore, uid: string, prefs: Prefs) {
    await setField(db, ['users', uid], 'prefs', prefs);
  },
};

// ── Slider (admin / shared config) ───────────────────────────

export const dbSliderStore = {
  async get(db: Firestore): Promise<SliderItem[]> {
    return getField<SliderItem[]>(db, ['config', 'slider'], 'items', []);
  },
  async set(db: Firestore, items: SliderItem[]) {
    await setField(db, ['config', 'slider'], 'items', items);
  },
};

// ── Notification templates (admin / shared config) ───────────────────────

export const dbNotificationTemplateStore = {
  async get(db: Firestore): Promise<NotificationTemplates> {
    const value = await getField<NotificationTemplates>(
      db,
      ['config', 'notification_templates'],
      'templates',
      DEFAULT_NOTIFICATION_TEMPLATES,
    );
    return normalizeNotificationTemplates(value);
  },
  async set(db: Firestore, templates: NotificationTemplates) {
    await setDoc(
      doc(db, 'config', 'notification_templates'),
      { templates: normalizeNotificationTemplates(templates), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  },
};

export type NotificationJob = {
  title: string;
  body: string;
  target: 'all' | 'vip' | 'free';
  link?: string;
  scheduledAt: string;
  status: 'pending';
  createdAt: string;
};

export const dbNotificationJobStore = {
  async enqueue(db: Firestore, job: Omit<NotificationJob, 'status' | 'createdAt'>): Promise<string> {
    const created = await addDoc(collection(db, 'notification_jobs'), {
      ...job,
      status: 'pending',
      createdAt: new Date().toISOString(),
    } satisfies NotificationJob);
    return created.id;
  },
};

// ── Activity feed (list actions + reviews visible to all) ────
// Firestore: activity/{auto-id}  ordered by createdAt desc

export type ActivityDoc = {
  uid:       string;
  userId?:   string;
  reviewId?: string;       // links feed item to its exact review/replies
  username:  string;
  authorName?: string;
  authorUsername?: string;
  avatar:    string;
  photoUrl:  string;
  authorAvatarUrl?: string;
  titleKey:  string;       // e.g. "tv_1396"
  titleId?:  string;
  titleName: string;
  titleType?: 'movie' | 'tv' | 'episode';
  titleImageUrl?: string | null;
  poster:    string | null;
  action:    'watched' | 'watching' | 'want' | 'reviewed';
  rating:    number;       // 0 if not a review
  text:      string;       // review text, empty otherwise
  mediaUrl?: string;       // optional GIF or external image URL
  spoiler?:  boolean;
  createdAt: string;       // ISO string
};

export type ActivityPageCursor = QueryDocumentSnapshot<DocumentData>;

export type ReviewActivityTarget = {
  docId?: string;
  reviewId?: string;
  titleKey: string;
  uid?: string;
  username: string;
  text: string;
  rating: number;
  createdAt: string;
};

export const dbActivityStore = {
  async add(db: Firestore, item: ActivityDoc): Promise<void> {
    try { await addDoc(collection(db, 'activity'), item); } catch {}
  },

  async getPage(
    db: Firestore,
    cursor: ActivityPageCursor | null = null,
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<FirestorePage<ActivityDoc & { docId: string }, ActivityPageCursor>> {
    const pageSize = boundedPageSize(requestedSize);
    try {
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(pageSize));
      const q = query(collection(db, 'activity'), ...constraints);
      const snap = await getDocs(q);
      dataCostDebug.query('activity:page', snap.size);
      return {
        items: snap.docs.map((d) => ({ docId: d.id, ...d.data() as ActivityDoc })),
        cursor: snap.empty ? null : snap.docs[snap.docs.length - 1],
        hasMore: snap.size === pageSize,
      };
    } catch { return { items: [], cursor: null, hasMore: false }; }
  },

  async getRecent(db: Firestore, limitN = FIRESTORE_PAGE_SIZE): Promise<(ActivityDoc & { docId: string })[]> {
    return (await dbActivityStore.getPage(db, null, limitN)).items;
  },

  async getForUser(
    db: Firestore,
    uid: string,
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<(ActivityDoc & { docId: string })[]> {
    const pageSize = boundedPageSize(requestedSize);
    try {
      const snap = await getDocs(query(
        collection(db, 'activity'),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(pageSize),
      ));
      dataCostDebug.query('activity:user-page', snap.size);
      return snap.docs.map((entry) => ({ docId: entry.id, ...entry.data() as ActivityDoc }));
    } catch { return []; }
  },

  async delete(db: Firestore, docId: string): Promise<void> {
    // Do not swallow permission/network errors: callers must only remove the
    // card from the UI after Firestore confirms the deletion.
    await deleteDoc(doc(db, 'activity', docId));
  },

  /** Delete every activity document that represents one review. Old activity
      documents predate reviewId, so the closest author/content/date match is
      also removed. This prevents a deleted review from being rebuilt in the
      feed after a reload. */
  async deleteForReview(db: Firestore, target: ReviewActivityTarget): Promise<number> {
    const ids = new Set<string>();
    if (target.docId) ids.add(target.docId);
    if (target.reviewId) {
      const exact = await getDocs(query(
        collection(db, 'activity'),
        where('reviewId', '==', target.reviewId),
        limit(FIRESTORE_PAGE_SIZE),
      ));
      dataCostDebug.query('activity:delete-review', exact.size);
      exact.docs.forEach((entry) => {
        if (entry.data()?.titleKey === target.titleKey) ids.add(entry.id);
      });
    }

    // Bounded compatibility lookup for old activity docs without reviewId.
    if (ids.size === 0 && target.uid) {
      const legacySnap = await getDocs(query(
        collection(db, 'activity'),
        where('uid', '==', target.uid),
        where('titleKey', '==', target.titleKey),
        limit(FIRESTORE_PAGE_SIZE),
      ));
      dataCostDebug.query('activity:delete-legacy', legacySnap.size);
      const legacyMatches = legacySnap.docs
        .map((entry) => ({ docId: entry.id, ...entry.data() as ActivityDoc }))
        .filter((activity) => !activity.reviewId
          && activity.action === 'reviewed'
          && activity.text === target.text
          && activity.rating === target.rating)
        .sort((a, b) => {
          const targetTime = new Date(target.createdAt).getTime();
          return Math.abs(new Date(a.createdAt).getTime() - targetTime)
            - Math.abs(new Date(b.createdAt).getTime() - targetTime);
        });
      if (legacyMatches[0]) ids.add(legacyMatches[0].docId);
    }
    if (ids.size === 0) return 0;

    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'activity', id)));
    await batch.commit();
    return ids.size;
  },
};

const ACTIVE_TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Records authenticated app use at most once every six hours per browser. */
export const dbPresenceStore = {
  async touch(db: Firestore, uid: string): Promise<void> {
    const key = `maratonou:last-active-write:${uid}`;
    const previous = Number(localStorage.getItem(key) || 0);
    if (Date.now() - previous < ACTIVE_TOUCH_INTERVAL_MS) return;
    await setDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }, { merge: true });
    localStorage.setItem(key, String(Date.now()));
  },
};

// ── Reports ──────────────────────────────────────────────────
// Firestore: reports/{auto-id}

export type ReportDoc = {
  /** comment = denúncia de comentário; profile = denúncia de perfil;
      problem = "relatar problema" de uma página de título */
  kind: 'comment' | 'profile' | 'problem';
  reason: 'spoiler' | 'spam' | 'offense' | 'other' | 'problem';
  /** free text (reason 'other' / 'problem') */
  details?: string;
  /** reviewId | username | titleKey, depending on kind */
  targetId: string;
  titleKey?: string;
  /** human-readable target: title name or @username */
  targetLabel: string;
  contentSnippet?: string;
  reportedUser?: string;
  reportedBy: string;
  reportedByName?: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
};

export const dbReportStore = {
  async add(db: Firestore, report: Omit<ReportDoc, 'status' | 'createdAt'>): Promise<boolean> {
    try {
      await addDoc(collection(db, 'reports'), stripUndefined({
        ...report, status: 'open', createdAt: new Date().toISOString(),
      }));
      return true;
    } catch { return false; }
  },

  /** Admin only (rules) — newest first. */
  async list(db: Firestore, limitN = FIRESTORE_PAGE_SIZE): Promise<(ReportDoc & { docId: string })[]> {
    try {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc'),
        limit(boundedPageSize(limitN, 50)),
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ docId: d.id, ...d.data() as ReportDoc }));
    } catch { return []; }
  },

  async setStatus(db: Firestore, docId: string, status: ReportDoc['status']): Promise<void> {
    try { await updateDoc(doc(db, 'reports', docId), { status }); } catch {}
  },
};

// ── Feed reactions ───────────────────────────────────────────
// Firestore: reactions/{feedItemId} → { users: { [uid]: emoji } }
// One emoji per user; counts are derived by aggregating the map.

export const dbReactionStore = {
  async get(db: Firestore, feedItemId: string): Promise<Record<string, string>> {
    return getField<Record<string, string>>(db, ['reactions', feedItemId], 'users', {});
  },
  // emoji === null removes the user's reaction
  async set(db: Firestore, feedItemId: string, uid: string, emoji: string | null): Promise<void> {
    try {
      await setDoc(
        doc(db, 'reactions', feedItemId),
        { users: { [uid]: emoji === null ? deleteField() : emoji } },
        { merge: true },
      );
    } catch {}
  },
};

// ── Streaming expenses ───────────────────────────────────────
// Firestore: users/{uid}.expenses — the localStorage cache
// (sec_expenses_v1) is uid-scoped-wiped on account switch, so without
// this cloud copy every new session started from zero.

export const dbExpensesStore = {
  /** null = the field was never written for this account (≠ empty list). */
  async get(db: Firestore, uid: string): Promise<unknown[] | null> {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const v = snap.data()?.expenses;
      return Array.isArray(v) ? v : null;
    } catch { return null; }
  },
  async set(db: Firestore, uid: string, subs: unknown[]) {
    await setField(db, ['users', uid], 'expenses', subs);
  },
};

// ── PRO preferences ─────────────────────────────────────────
// Stored outside the public profile payload: only the profile appearance is
// public; Home composition and reminder dates are private account settings.
export const dbProSettingsStore = {
  async get(db: Firestore, uid: string): Promise<ProSettings | null> {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'private', 'pro_settings'));
      const value = snap.data()?.value;
      return value && typeof value === 'object' ? value as ProSettings : null;
    } catch { return null; }
  },
  async set(db: Firestore, uid: string, settings: ProSettings) {
    await setDoc(doc(db, 'users', uid, 'private', 'pro_settings'), { value: settings }, { merge: true });
  },
};

// ── Real-time subscription: users/{uid} → localStorage ───────
// Call on login; returns an Unsubscribe function.
// Whenever the user's doc changes in Firestore (other device wrote),
// localStorage is refreshed and a custom event is fired so
// any component can re-read and re-render.

const LIST_KEY  = 'sec_lists_v1';
const PREFS_KEY = 'sec_prefs';

export function subscribeUserDoc(db: Firestore, uid: string): Unsubscribe {
  const stopUserMetric = dataCostDebug.listenerStart('users:current');
  const unsubscribeUser = onSnapshot(doc(db, 'users', uid), (snap) => {
    if (typeof window === 'undefined' || !snap.exists()) return;
    const data = snap.data();
    if (!data) return;

    // ── Lists ──────────────────────────────────────────────
    const all: Record<string, unknown[]> = (() => {
      try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; }
    })();
    let listsChanged = false;
    for (const t of ['want', 'watching', 'watched', 'favorites'] as const) {
      const items = data[`lists_${t}`];
      if (Array.isArray(items)) { all[t] = items; listsChanged = true; }
    }
    if (listsChanged) {
      try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}
    }

    // ── Profile (uid-scoped key) ───────────────────────────
    if (data.profile && typeof data.profile === 'object') {
      try { localStorage.setItem(profileKey(uid), JSON.stringify(data.profile)); } catch {}
    }

    // ── Prefs ──────────────────────────────────────────────
    if (data.prefs && typeof data.prefs === 'object') {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(data.prefs)); } catch {}
    }

    // ── Episode watched ────────────────────────────────────
    if (data.ep_watched && typeof data.ep_watched === 'object') {
      try { localStorage.setItem('sec_ep_watched_v1', JSON.stringify(data.ep_watched)); } catch {}
    }

    // ── Following list ─────────────────────────────────────
    if (Array.isArray(data.following_list)) {
      try { localStorage.setItem('sec_following', JSON.stringify(data.following_list)); } catch {}
    }

    // ── Streaming expenses ─────────────────────────────────
    if (Array.isArray(data.expenses)) {
      try { localStorage.setItem('sec_expenses_v1', JSON.stringify(data.expenses)); } catch {}
    }

    // Notify all listening components
    window.dispatchEvent(new Event('maratonou:sync'));
  });

  const stopProMetric = dataCostDebug.listenerStart('users:pro-settings');
  const unsubscribePro = onSnapshot(doc(db, 'users', uid, 'private', 'pro_settings'), (snap) => {
    if (typeof window === 'undefined' || !snap.exists()) return;
    const value = snap.data()?.value;
    if (!value || typeof value !== 'object') return;
    try { localStorage.setItem(proSettingsKey(uid), JSON.stringify(value)); } catch {}
    window.dispatchEvent(new Event('maratonou:pro'));
  });

  return () => {
    unsubscribeUser();
    unsubscribePro();
    stopUserMetric();
    stopProMetric();
  };
}

// ── Episode watched ──────────────────────────────────────────

export const dbEpWatchedStore = {
  async set(db: Firestore, uid: string, data: Record<string, Record<string, number[]>>) {
    await setField(db, ['users', uid], 'ep_watched', data);
  },
};

// ── Following list ───────────────────────────────────────────

export const dbFollowStore = {
  async get(db: Firestore, uid: string): Promise<string[]> {
    return getField<string[]>(db, ['users', uid], 'following_list', []);
  },
  async set(db: Firestore, uid: string, list: string[]): Promise<void> {
    await setField(db, ['users', uid], 'following_list', list);
  },
  /** The client writes its own following relation. A trusted Cloud Function
      mirrors it to the target's followers subcollection and maintains both
      aggregate counters. The legacy array remains during the migration. */
  async follow(
    db: Firestore,
    followerUid: string,
    targetUsername: string,
    targetUid?: string,
    targetPublic: Partial<FollowerInfo> = {},
  ): Promise<void> {
    if (targetUid && targetUid === followerUid) throw new Error('Você não pode seguir a si mesmo.');
    const followerRef = doc(db, 'users', followerUid);
    const snap = await getDoc(followerRef);
    const currentList: string[] = snap.data()?.following_list ?? [];
    const nextList = currentList.includes(targetUsername) ? currentList : [...currentList, targetUsername];
    const batch = writeBatch(db);
    batch.update(followerRef, { following_list: nextList });
    if (targetUid) {
      batch.set(doc(db, 'users', followerUid, 'following', targetUid), stripUndefined({
        userId: targetUid,
        username: targetPublic.username || targetUsername,
        name: targetPublic.name || '',
        avatarImage: targetPublic.avatarThumbImage || targetPublic.avatarImage || '',
        avatarLetter: targetPublic.avatarLetter || '',
        avatarGradient: targetPublic.avatarGradient || '',
        createdAt: serverTimestamp(),
      }));
    }
    await batch.commit();
  },
  async unfollow(db: Firestore, followerUid: string, targetUsernames: string | string[], targetUid?: string): Promise<void> {
    const followerRef = doc(db, 'users', followerUid);
    const snap = await getDoc(followerRef);
    const currentList: string[] = snap.data()?.following_list ?? [];
    // Drop the canonical username and any legacy display-name entry
    const identities = new Set(Array.isArray(targetUsernames) ? targetUsernames : [targetUsernames]);
    const nextList = currentList.filter(u => !identities.has(u));
    const batch = writeBatch(db);
    let changed = false;
    if (nextList.length !== currentList.length) {
      batch.update(followerRef, { following_list: nextList });
      changed = true;
    }
    if (targetUid) {
      batch.delete(doc(db, 'users', followerUid, 'following', targetUid));
      changed = true;
    }
    if (!changed) return;
    await batch.commit();
  },
};

export type FollowerInfo = {
  uid: string; username: string; name: string;
  avatarImage: string; avatarThumbImage?: string; avatarLetter: string; avatarGradient: string;
};

export type FollowPageCursor = QueryDocumentSnapshot<DocumentData>;

function relationInfo(entry: QueryDocumentSnapshot<DocumentData>): FollowerInfo {
  const data = entry.data();
  return {
    uid: String(data.userId || entry.id),
    username: String(data.username || ''),
    name: String(data.name || ''),
    avatarImage: String(data.avatarImage || ''),
    avatarThumbImage: String(data.avatarThumbImage || data.avatarImage || ''),
    avatarLetter: String(data.avatarLetter || ''),
    avatarGradient: String(data.avatarGradient || ''),
  };
}

export async function getFollowRelationsPage(
  db: Firestore,
  uid: string,
  kind: 'followers' | 'following',
  cursor: FollowPageCursor | null = null,
  requestedSize = FIRESTORE_PAGE_SIZE,
): Promise<FirestorePage<FollowerInfo, FollowPageCursor>> {
  const pageSize = boundedPageSize(requestedSize);
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize));
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, kind), ...constraints));
    dataCostDebug.query(`follow:${kind}:page`, snap.size);
    return {
      items: snap.docs.map(relationInfo),
      cursor: snap.empty ? null : snap.docs[snap.docs.length - 1],
      hasMore: snap.size === pageSize,
    };
  } catch {
    return { items: [], cursor: null, hasMore: false };
  }
}

/**
 * Everyone whose following_list contains any of `identities`.
 *
 * Pass the target's canonical username *plus* their aliases and display
 * name: older follows stored whatever slug was in the URL (often the
 * display name, e.g. "Danilo" instead of "danilo"), so matching only the
 * canonical username would miss them.
 */
export async function getFollowers(db: Firestore, identities: string[], targetUid?: string): Promise<FollowerInfo[]> {
  if (targetUid) {
    const page = await getFollowRelationsPage(db, targetUid, 'followers');
    if (page.items.length) return page.items;
  }
  const wanted = Array.from(new Set(identities.filter(Boolean)));
  const seen = new Map<string, FollowerInfo>();
  await Promise.all(wanted.map(async (identity) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('following_list', 'array-contains', identity), limit(FIRESTORE_PAGE_SIZE))
      );
      dataCostDebug.query('follow:legacy-followers', snap.size);
      snap.forEach(d => {
        if (seen.has(d.id)) return;
        const p = d.data()?.profile ?? {};
        seen.set(d.id, {
          uid: d.id,
          username: p.username || '', name: p.name || '',
          avatarImage: p.avatarThumbImage || p.avatarImage || '', avatarThumbImage: p.avatarThumbImage || '', avatarLetter: p.avatarLetter || '',
          avatarGradient: p.avatarGradient || '',
        });
      });
    } catch { /* rules/offline — treated as no followers */ }
  }));
  return Array.from(seen.values());
}

// ── Monthly ranking (materialized by Cloud Functions) ───────

export type MonthlyRankingEntry = {
  uid: string;
  name: string;
  username: string;
  avatarGradient: string;
  avatarUrl: string;
  watchedCount: number;
  reviewsCount: number;
  watchedMinutes: number;
  score: number;
  updatedAt?: unknown;
};

export function rankingMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const dbRankingStore = {
  monthKey: rankingMonthKey,
  async listMonth(
    db: Firestore,
    month = rankingMonthKey(),
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<MonthlyRankingEntry[]> {
    const pageSize = boundedPageSize(requestedSize);
    try {
      const snap = await getDocs(query(
        collection(db, 'rankingMonthly', month, 'entries'),
        orderBy('score', 'desc'),
        limit(pageSize),
      ));
      dataCostDebug.query('ranking:month', snap.size);
      return snap.docs.map((entry) => ({
        uid: entry.id,
        ...entry.data(),
      } as MonthlyRankingEntry));
    } catch {
      return [];
    }
  },
  async getUser(db: Firestore, uid: string, month = rankingMonthKey()): Promise<MonthlyRankingEntry | null> {
    try {
      const snap = await getDoc(doc(db, 'rankingMonthly', month, 'entries', uid));
      dataCostDebug.query('ranking:user', snap.exists() ? 1 : 0);
      return snap.exists() ? { uid: snap.id, ...snap.data() } as MonthlyRankingEntry : null;
    } catch {
      return null;
    }
  },
};

export type UserStatsAggregate = {
  uid: string;
  recentDays: Record<string, { activities: number; watched: number }>;
  months: Record<string, { activities: number; watched: number; watchedMinutes: number }>;
  updatedAt?: unknown;
};

export const dbUserStatsStore = {
  async get(db: Firestore, uid: string): Promise<UserStatsAggregate> {
    return cachedRequest(`user-stats:${uid}`, CACHE_TTL.recentList, async () => {
      const snap = await getDoc(doc(db, 'userStats', uid));
      dataCostDebug.query('user-stats:get', snap.exists() ? 1 : 0);
      const data = snap.data() || {};
      return {
        uid,
        recentDays: data.recentDays || {},
        months: data.months || {},
        updatedAt: data.updatedAt,
      };
    }, { staleIfError: true });
  },
};

// ── Social Notifications ─────────────────────────────────────
// Firestore: notifications/{auto-id}
// Required composite index: recipientId ASC, createdAt DESC

export type NotifDoc = {
  recipientId: string;
  category: 'account';
  type: 'new_follower' | 'comment_reply' | 'comment_like';
  actorId: string;
  actorUsername: string;
  actorName: string;
  actorAvatarLetter: string;
  actorAvatarImage: string;
  titleKey?: string;
  titleName?: string;
  poster?: string;
  commentSnippet?: string;
  read: boolean;
  createdAt: string;
  link?: string;
};

export type NotificationPageCursor = QueryDocumentSnapshot<DocumentData>;

export const dbNotifStore = {
  async add(db: Firestore, notif: Omit<NotifDoc, 'read'>): Promise<boolean> {
    const prefByType: Record<NotifDoc['type'], string> = {
      new_follower: 'followers',
      comment_reply: 'replies',
      comment_like: 'likes',
    };
    try {
      const recipientPrefs = await dbPrefsStore.get(db, notif.recipientId);
      if (recipientPrefs.notifPrefs?.[prefByType[notif.type]] === false) return false;
      await addDoc(collection(db, 'notifications'), { ...notif, read: false });
      return true;
    } catch {
      return false;
    }
  },

  async listPage(
    db: Firestore,
    uid: string,
    cursor: NotificationPageCursor | null = null,
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<FirestorePage<NotifDoc & { docId: string }, NotificationPageCursor>> {
    const pageSize = boundedPageSize(requestedSize);
    try {
      const constraints: QueryConstraint[] = [
        where('recipientId', '==', uid),
        orderBy('createdAt', 'desc'),
      ];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(pageSize));
      const q = query(collection(db, 'notifications'), ...constraints);
      const snap = await getDocs(q);
      dataCostDebug.query('notifications:account-page', snap.size);
      return {
        items: snap.docs.map(d => ({ docId: d.id, ...d.data() as NotifDoc })),
        cursor: snap.empty ? null : snap.docs[snap.docs.length - 1],
        hasMore: snap.size === pageSize,
      };
    } catch { return { items: [], cursor: null, hasMore: false }; }
  },

  async listForUser(db: Firestore, uid: string): Promise<(NotifDoc & { docId: string })[]> {
    return (await dbNotifStore.listPage(db, uid)).items;
  },

  async markRead(db: Firestore, docId: string): Promise<void> {
    try { await updateDoc(doc(db, 'notifications', docId), { read: true }); } catch {}
  },

  async markAllRead(db: Firestore, uid: string): Promise<void> {
    try {
      for (;;) {
        const q = query(
          collection(db, 'notifications'),
          where('recipientId', '==', uid),
          where('read', '==', false),
          limit(FIRESTORE_PAGE_SIZE),
        );
        const snap = await getDocs(q);
        dataCostDebug.query('notifications:mark-all', snap.size);
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.update(d.ref, { read: true }));
        await batch.commit();
        if (snap.size < FIRESTORE_PAGE_SIZE) return;
      }
    } catch {}
  },

  async clearAll(db: Firestore, uid: string): Promise<void> {
    for (;;) {
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', uid),
        limit(FIRESTORE_PAGE_SIZE),
      );
      const snap = await getDocs(q);
      dataCostDebug.query('notifications:account-clear', snap.size);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
      if (snap.size < FIRESTORE_PAGE_SIZE) return;
    }
  },
};

// ── Automated app notifications ──────────────────────────────────────
// Written by Firebase Admin SDK/Cloud Functions. Clients can only read and
// mark their own documents as read.

export type AppNotifDoc = Omit<InboxNotif, 'id' | 'cloudId'> & {
  recipientId: string;
  eventKey: string;
};

export const dbAppNotifStore = {
  async listPage(
    db: Firestore,
    uid: string,
    cursor: NotificationPageCursor | null = null,
    requestedSize = FIRESTORE_PAGE_SIZE,
  ): Promise<FirestorePage<InboxNotif, NotificationPageCursor>> {
    const pageSize = boundedPageSize(requestedSize);
    const constraints: QueryConstraint[] = [where('recipientId', '==', uid), orderBy('time', 'desc')];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const q = query(collection(db, 'app_notifications'), ...constraints);
    const snap = await getDocs(q);
    dataCostDebug.query('notifications:app-page', snap.size);
    const items = snap.docs.map((entry) => {
      const data = entry.data() as AppNotifDoc;
      return {
        id: data.eventKey || entry.id,
        cloudId: entry.id,
        type: data.type,
        title: data.title,
        body: data.body,
        time: data.time,
        read: data.read,
        link: data.link,
        poster: data.poster,
      };
    });
    return {
      items,
      cursor: snap.empty ? null : snap.docs[snap.docs.length - 1],
      hasMore: snap.size === pageSize,
    };
  },
  async listForUser(db: Firestore, uid: string): Promise<InboxNotif[]> {
    return (await dbAppNotifStore.listPage(db, uid)).items;
  },
  async markRead(db: Firestore, docId: string): Promise<void> {
    await updateDoc(doc(db, 'app_notifications', docId), { read: true });
  },
  async markAllRead(db: Firestore, uid: string): Promise<void> {
    for (;;) {
      const q = query(
        collection(db, 'app_notifications'),
        where('recipientId', '==', uid),
        where('read', '==', false),
        limit(FIRESTORE_PAGE_SIZE),
      );
      const snap = await getDocs(q);
      dataCostDebug.query('notifications:app-mark-all', snap.size);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((entry) => batch.update(entry.ref, { read: true }));
      await batch.commit();
      if (snap.size < FIRESTORE_PAGE_SIZE) return;
    }
  },
  async clearAll(db: Firestore, uid: string): Promise<void> {
    for (;;) {
      const q = query(
        collection(db, 'app_notifications'),
        where('recipientId', '==', uid),
        limit(FIRESTORE_PAGE_SIZE),
      );
      const snap = await getDocs(q);
      dataCostDebug.query('notifications:app-clear', snap.size);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((entry) => batch.delete(entry.ref));
      await batch.commit();
      if (snap.size < FIRESTORE_PAGE_SIZE) return;
    }
  },
};

// ── FCM Tokens ───────────────────────────────────────────────

// Tokens live under users/{uid}/private/push — NOT on the public user doc.
// The users collection is readable by any signed-in account (public profiles),
// and push tokens don't belong in that read surface.
const privatePushDoc = (db: Firestore, uid: string) => doc(db, 'users', uid, 'private', 'push');

export const dbTokenStore = {
  async save(db: Firestore, uid: string, token: string) {
    await setDoc(privatePushDoc(db, uid), { tokens: arrayUnion(token) }, { merge: true });
    // Clear tokens parked on the public profile doc by older builds.
    try { await updateDoc(doc(db, 'users', uid), { fcm_tokens: deleteField() }); } catch {}
  },
  async remove(db: Firestore, uid: string, token: string) {
    try {
      await updateDoc(privatePushDoc(db, uid), { tokens: arrayRemove(token) });
    } catch {}
  },
};

// ── Sync: Firestore → localStorage (runs on every login) ────────

export async function syncFromFirestore(db: Firestore, uid: string, email?: string | null, authName?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const LIST_KEY = 'sec_lists_v1';
    const all: Record<string, ListItem[]> = (() => {
      try { return JSON.parse(localStorage.getItem(LIST_KEY) || '{}'); } catch { return {}; }
    })();
    // Firestore is authoritative: an empty list on the server must clear the
    // local cache too, otherwise a previous account's items survive here.
    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      all[type] = await dbListStore.get(db, uid, type);
    }
    try { localStorage.setItem(LIST_KEY, JSON.stringify(all)); } catch {}

    // ── Episode watched + following list + username migration ──
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const data = userSnap.data();
      if (data?.ep_watched && typeof data.ep_watched === 'object') {
        localStorage.setItem('sec_ep_watched_v1', JSON.stringify(data.ep_watched));
      }
      if (Array.isArray(data?.expenses)) {
        localStorage.setItem('sec_expenses_v1', JSON.stringify(data.expenses));
      }
      if (Array.isArray(data?.following_list)) {
        localStorage.setItem('sec_following', JSON.stringify(data.following_list));
      }
      if (data?.profile) {
        // One-time: username becomes the slug of the Name (João Miguel → joao-miguel),
        // falling back to the auth displayName then the email prefix. The previous
        // username is preserved in profile.aliases.
        await migrateUsernameToSlug(db, uid, authName, email);
      }
    } catch {}

    try {
      const proSettings = await dbProSettingsStore.get(db, uid);
      if (proSettings) localStorage.setItem(proSettingsKey(uid), JSON.stringify(proSettings));
    } catch {}

    console.info('[DB] Firestore → localStorage sync ✓');
  } catch (e) {
    console.warn('[DB] Sync from Firestore failed', e);
  }
}

// ── Migration: localStorage → Firestore (runs once after login) ──

export async function migrateLocalToFirestore(db: Firestore, uid: string) {
  if (typeof window === 'undefined') return;
  const MIGRATED_KEY = `sec_migrated_${uid}`;
  if (localStorage.getItem(MIGRATED_KEY)) return; // already done

  try {
    const { listStore, revStore, profileStore, prefsStore, proSettingsStore } = await import('./store');

    const profile = profileStore.get(uid);
    if (profile.name) await dbProfileStore.set(db, uid, profile);

    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      const items = listStore.get(type);
      if (items.length) await setField(db, ['users', uid], `lists_${type}`, items);
    }

    const prefs = prefsStore.get();
    if (Object.keys(prefs).length) await dbPrefsStore.set(db, uid, prefs);

    // A fresh device has no local PRO document. Never upload defaults before
    // the initial Firestore pull, otherwise valid remote reminders are lost.
    if (localStorage.getItem(proSettingsKey(uid))) {
      await dbProSettingsStore.set(db, uid, proSettingsStore.get(uid));
    }

    // migrate episode watched data
    const { epWatchedStore } = await import('./store');
    const epWatched = epWatchedStore.getAll();
    if (Object.keys(epWatched).length) {
      await setField(db, ['users', uid], 'ep_watched', epWatched);
    }

    // migrate reviews — one doc per review; local reviews were written on
    // this device by this account, so it claims authorship of any without uid
    const allReviews = (() => { try { return JSON.parse(localStorage.getItem('sec_reviews_v1') || '{}'); } catch { return {}; } })();
    for (const [key, items] of Object.entries(allReviews)) {
      if (!Array.isArray(items)) continue;
      for (const r of items as Review[]) {
        try { await dbRevStore.add(db, key, { ...r, uid: r.uid || uid }); } catch {}
      }
    }

    localStorage.setItem(MIGRATED_KEY, '1');
    console.info('[DB] localStorage migrated to Firestore ✓');
  } catch (e) {
    console.warn('[DB] Migration failed', e);
  }
}
