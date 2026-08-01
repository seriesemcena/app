/* ─────────────────────────────────────────────────────────────
   Firestore data layer — mirrors the localStorage store.ts API
   so components can swap between local and cloud storage.

   Firestore structure:
     users/{uid}                     — public in-app profile and social lists
     users/{uid}/private/preferences — owner-only preferences
     users/{uid}/private/expenses    — owner-only streaming expenses
     users/{uid}/private/blocks      — owner-only block relationships
     users/{uid}/private/history     — owner-only legacy episode history
     users/{uid}/private/push        — owner-only FCM tokens
     users/{uid}/system/account      — server-only account/moderation state
     reviews/{titleKey}              — { items: Review[] }
     config/slider                   — { items: SliderItem[] }
   ───────────────────────────────────────────────────────────── */
import {
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, increment, writeBatch,
  collection, collectionGroup, addDoc, getDocs, deleteDoc, query, orderBy, limit, onSnapshot, where,
  deleteField, documentId, startAfter, startAt, endAt, runTransaction, serverTimestamp,
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
import {
  SEASON_PROGRESS_SCHEMA_VERSION,
  calculateWatchedDuration,
  legacyHistoryToSeasonProgress,
  mergeSeasonProgress,
  recordsToLegacyHistory,
  seasonProgressId,
  uniqueEpisodeNumbers,
  type LegacyEpisodeHistory,
  type SeasonProgressRecord,
} from './seasonProgress';

type ListType = 'want' | 'watching' | 'watched' | 'favorites';
type ListItem = { id: number; title: string; type: string; poster_path?: string | null };
const PRIVATE_DATA_SCHEMA_VERSION = 1;

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

function privateDataDoc(db: Firestore, uid: string, documentId: string) {
  return doc(db, 'users', uid, 'private', documentId);
}

async function getPrivateValue<T>(
  db: Firestore,
  uid: string,
  documentId: string,
  fallback: T,
): Promise<{ exists: boolean; value: T }> {
  try {
    const snap = await getDoc(privateDataDoc(db, uid, documentId));
    if (!snap.exists()) return { exists: false, value: fallback };
    return { exists: true, value: (snap.data()?.value ?? fallback) as T };
  } catch {
    return { exists: false, value: fallback };
  }
}

async function setPrivateValue(
  db: Firestore,
  uid: string,
  documentId: string,
  value: unknown,
) {
  await setDoc(privateDataDoc(db, uid, documentId), {
    value,
    schemaVersion: PRIVATE_DATA_SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── Profile ──────────────────────────────────────────────────

const PROFILE_DEFAULT: Profile = {
  name: '', username: '', bio: '',
  avatarLetter: '', avatarGradient: '', avatarImage: '', avatarThumbImage: '', coverImage: '',
  social: { instagram: '', twitter: '', tiktok: '' },
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
              social: { ...PROFILE_DEFAULT.social, ...(profile.social ?? {}) },
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
      social: {
        ...PROFILE_DEFAULT.social,
        ...(d.data()?.profile?.social ?? {}),
      },
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
  async getById(
    db: Firestore,
    titleKey: string,
    reviewId: string,
  ): Promise<Review | null> {
    try {
      const current = await getDoc(doc(revCol(db, titleKey), reviewId));
      dataCostDebug.query('reviews:single', current.exists() ? 1 : 0);
      if (current.exists()) {
        const review = current.data() as Review;
        return reviewIsVisible(review) ? review : null;
      }

      const legacySnap = await getDoc(doc(db, 'reviews', titleKey));
      dataCostDebug.query('reviews:single-legacy', legacySnap.exists() ? 1 : 0);
      const legacy = ((legacySnap.data()?.items ?? []) as Review[])
        .find((review) => review.id === reviewId);
      return legacy && reviewIsVisible(legacy) ? legacy : null;
    } catch {
      return null;
    }
  },

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
      // The ordered subcollection query needs a COLLECTION-scope index on
      // items.date; when that index is missing the read throws failed-
      // precondition. Recover by reading the subcollection UNORDERED and
      // sorting in memory so comments still show. The old fallback read only
      // the legacy array — empty for comments stored in the per-review
      // subcollection, which is exactly why the comments page came up blank.
      if (!cursor) {
        let pool: Review[] = [];
        try {
          const unordered = await getDocs(revCol(db, titleKey));
          pool = unordered.docs.map((entry) => entry.data() as Review).filter(reviewIsVisible);
        } catch { /* subcollection unreadable → try the legacy array below */ }
        if (pool.length === 0) {
          pool = (await getField<Review[]>(db, ['reviews', titleKey], 'items', [])).filter(reviewIsVisible);
        }
        const sorted = pool.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
    const ref = doc(revCol(db, titleKey), reviewId);
    const exists = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return null;
      const likedBy = (((snap.data() as Review).likedBy) ?? []).slice();
      const idx = likedBy.indexOf(userId);
      if (idx >= 0) likedBy.splice(idx, 1); else likedBy.push(userId);
      transaction.update(ref, { likedBy, likes: likedBy.length });
      return true;
    });
    return exists ? dbRevStore.get(db, titleKey) : null;
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

function invalidateRatingSummary(titleKey: string) {
  invalidateCache(`rating-summary:${titleKey}`);
  const episodeMatch = titleKey.match(/^ep_(.+)_s\d+_e\d+$/);
  if (episodeMatch) invalidateCache(`rating-summary:tv_${episodeMatch[1]}:episodes`);
}

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
    invalidateRatingSummary(titleKey);
  },
  /** Imports a legacy local rating without replacing a rating that already
      exists in Firestore. This makes the ratingsV1 migration idempotent and
      keeps the cloud copy authoritative when devices disagree. */
  async setIfMissing(
    db: Firestore,
    titleKey: string,
    uid: string,
    rawRating: number,
    sourceReviewId?: string,
  ): Promise<boolean> {
    if (!uid) return false;
    const rating = Math.max(1, Math.min(10, Math.round(rawRating)));
    const ref = ratingRef(db, titleKey, uid);
    const created = await runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      if (current.exists()) return false;
      transaction.set(ref, stripUndefined({
        titleId: titleKey,
        authorUid: uid,
        rating,
        sourceReviewId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
      return true;
    });
    if (created) invalidateRatingSummary(titleKey);
    return created;
  },
  async removeIfSource(db: Firestore, titleKey: string, uid: string, sourceReviewId: string) {
    const ref = ratingRef(db, titleKey, uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists() && snap.data()?.sourceReviewId === sourceReviewId) transaction.delete(ref);
    });
    invalidateRatingSummary(titleKey);
  },
  /** Account-wide ratings used by private profile statistics. Each rating
      document carries its titleId, so series, episodes and films can be split
      without downloading public review threads. */
  async listForUser(
    db: Firestore,
    uid: string,
  ): Promise<Array<{ titleId: string; rating: number; updatedAt?: unknown }>> {
    if (!uid) return [];
    const snap = await getDocs(query(
      collectionGroup(db, 'userRatings'),
      where('authorUid', '==', uid),
      limit(500),
    ));
    dataCostDebug.query('ratings:user', snap.size);
    return snap.docs
      .map((entry) => entry.data())
      .filter((entry) => typeof entry.titleId === 'string' && Number(entry.rating) > 0)
      .map((entry) => ({
        titleId: String(entry.titleId),
        rating: Math.max(1, Math.min(10, Number(entry.rating))),
        updatedAt: entry.updatedAt,
      }));
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

  /** Combines the compact summaries of every episode in a series.
      Episode ratings use keys such as `ep_125988_s1_e1`; querying the
      summaries by document-id prefix avoids reading private per-user ratings. */
  async getSeries(db: Firestore, tvId: string): Promise<RatingSummary> {
    const titleKey = `tv_${tvId}`;
    return cachedRequest(`rating-summary:${titleKey}:episodes`, CACHE_TTL.ratingSummary, async () => {
      const prefix = `ep_${tvId}_`;
      const snap = await getDocs(query(
        collection(db, 'ratingSummaries'),
        orderBy(documentId()),
        startAt(prefix),
        endAt(`${prefix}\uf8ff`),
      ));
      dataCostDebug.query('rating-summary:series', snap.size);

      const combined = snap.docs.reduce((summary, ratingDoc) => {
        const current = ratingDoc.data() as Partial<RatingSummary>;
        const currentTotal = Math.max(0, Number(current.total) || 0);
        const currentSum = Math.max(
          0,
          Number(current.sum) || ((Number(current.average) || 0) * currentTotal),
        );
        summary.total += currentTotal;
        summary.sum += currentSum;
        Object.entries(current.distribution || {}).forEach(([rating, count]) => {
          summary.distribution[rating] = (summary.distribution[rating] || 0) + (Number(count) || 0);
        });
        return summary;
      }, EMPTY_RATING_SUMMARY(titleKey));

      combined.average = combined.total ? combined.sum / combined.total : 0;
      return combined;
    }, { staleIfError: true });
  },
};

// ── Prefs ────────────────────────────────────────────────────

export const dbPrefsStore = {
  async get(db: Firestore, uid: string): Promise<Prefs> {
    const privatePrefs = await getPrivateValue<Prefs>(db, uid, 'preferences', {});
    if (privatePrefs.exists) return privatePrefs.value;
    return getField<Prefs>(db, ['users', uid], 'prefs', {});
  },
  async set(db: Firestore, uid: string, prefs: Prefs) {
    await setPrivateValue(db, uid, 'preferences', prefs);
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
    await setDoc(privateDataDoc(db, uid, 'activity'), {
      lastActiveAt: serverTimestamp(),
      schemaVersion: PRIVATE_DATA_SCHEMA_VERSION,
    }, { merge: true });
    localStorage.setItem(key, String(Date.now()));
  },
};

// ── Reports ──────────────────────────────────────────────────
// Firestore: reports/{auto-id}

export type ReportDoc = {
  /** comment = denúncia de comentário; profile = denúncia de perfil;
      problem = "relatar problema" de uma página de título */
  kind: 'comment' | 'profile' | 'problem';
  /** Stable structured reference used by moderation. `kind` is kept for
      compatibility with reports created before this field existed. */
  contentType: 'comment' | 'reply' | 'profile' | 'movie' | 'series' | 'other';
  contentId: string;
  parentContentId?: string;
  reportedUserId?: string;
  titleId?: string;
  titleType?: 'movie' | 'tv';
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
  status: 'open' | 'in_review' | 'resolved' | 'rejected' | 'dismissed';
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
// Firestore: users/{uid}/private/expenses — the localStorage cache
// (sec_expenses_v1) is uid-scoped-wiped on account switch, so without
// this cloud copy every new session started from zero.

export const dbExpensesStore = {
  /** null = the field was never written for this account (≠ empty list). */
  async get(db: Firestore, uid: string): Promise<unknown[] | null> {
    const privateExpenses = await getPrivateValue<unknown[] | null>(db, uid, 'expenses', null);
    if (privateExpenses.exists) {
      return Array.isArray(privateExpenses.value) ? privateExpenses.value : null;
    }
    const legacy = await getField<unknown[] | null>(db, ['users', uid], 'expenses', null);
    return Array.isArray(legacy) ? legacy : null;
  },
  async set(db: Firestore, uid: string, subs: unknown[]) {
    await setPrivateValue(db, uid, 'expenses', subs);
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

// ── Season premiere reminders ───────────────────────────────
// One document per user/title/season keeps the operation idempotent across
// devices and gives the scheduled notification worker a queryable due date.
export type SeasonPremiereReminder = {
  uid: string;
  tvId: number;
  seasonNumber: number;
  title: string;
  premiereDate: string;
  notifyAt: string;
  posterPath?: string | null;
  enabled: boolean;
  createdAt: string;
  notifiedAt?: string | null;
};

const seasonReminderId = (tvId: number | string, seasonNumber: number) => (
  `tv_${tvId}_s${seasonNumber}`
);

export const dbSeasonPremiereReminderStore = {
  async get(
    db: Firestore,
    uid: string,
    tvId: number | string,
    seasonNumber: number,
  ): Promise<SeasonPremiereReminder | null> {
    try {
      const snap = await getDoc(doc(
        db,
        'users',
        uid,
        'seasonReminders',
        seasonReminderId(tvId, seasonNumber),
      ));
      return snap.exists() ? snap.data() as SeasonPremiereReminder : null;
    } catch {
      return null;
    }
  },
  async set(db: Firestore, uid: string, reminder: SeasonPremiereReminder) {
    await setDoc(
      doc(db, 'users', uid, 'seasonReminders', seasonReminderId(reminder.tvId, reminder.seasonNumber)),
      reminder,
      { merge: true },
    );
  },
  async remove(db: Firestore, uid: string, tvId: number | string, seasonNumber: number) {
    await deleteDoc(doc(
      db,
      'users',
      uid,
      'seasonReminders',
      seasonReminderId(tvId, seasonNumber),
    ));
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

    // ── Following list ─────────────────────────────────────
    if (Array.isArray(data.following_list)) {
      try { localStorage.setItem('sec_following', JSON.stringify(data.following_list)); } catch {}
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

  const privateSubscriptions: Array<{
    documentId: string;
    storageKey: string;
    metric: string;
    accept: (value: unknown) => boolean;
  }> = [
    {
      documentId: 'preferences',
      storageKey: PREFS_KEY,
      metric: 'users:preferences',
      accept: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    },
    {
      documentId: 'history',
      storageKey: 'sec_ep_watched_v1',
      metric: 'users:history',
      accept: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    },
    {
      documentId: 'blocks',
      storageKey: 'sec_blocked',
      metric: 'users:blocks',
      accept: Array.isArray,
    },
    {
      documentId: 'expenses',
      storageKey: 'sec_expenses_v1',
      metric: 'users:expenses',
      accept: Array.isArray,
    },
  ];
  const privateStops = privateSubscriptions.map((subscription) => {
    const stopMetric = dataCostDebug.listenerStart(subscription.metric);
    const unsubscribe = onSnapshot(privateDataDoc(db, uid, subscription.documentId), (snap) => {
      if (typeof window === 'undefined' || !snap.exists()) return;
      const value = snap.data()?.value;
      if (!subscription.accept(value)) return;
      try { localStorage.setItem(subscription.storageKey, JSON.stringify(value)); } catch {}
      window.dispatchEvent(new Event('maratonou:sync'));
    });
    return () => {
      unsubscribe();
      stopMetric();
    };
  });

  return () => {
    unsubscribeUser();
    unsubscribePro();
    privateStops.forEach(stop => stop());
    stopUserMetric();
    stopProMetric();
  };
}

// ── Episode watched ──────────────────────────────────────────

export const dbEpWatchedStore = {
  async set(db: Firestore, uid: string, data: Record<string, Record<string, number[]>>) {
    await setPrivateValue(db, uid, 'history', data);
  },
};

// ── Canonical per-season progress ────────────────────────────

const seasonProgressRef = (db: Firestore, uid: string, seriesId: string | number, seasonNumber: number) =>
  doc(db, 'users', uid, 'seasonProgress', seasonProgressId(seriesId, seasonNumber));

export const dbSeasonProgressStore = {
  async getAll(db: Firestore, uid: string): Promise<SeasonProgressRecord[]> {
    const snap = await getDocs(collection(db, 'users', uid, 'seasonProgress'));
    dataCostDebug.query('season-progress:get-all', snap.size);
    return snap.docs.map((entry) => entry.data() as SeasonProgressRecord);
  },

  async merge(db: Firestore, uid: string, incoming: Partial<SeasonProgressRecord> & {
    seriesId: number;
    seasonNumber: number;
  }): Promise<SeasonProgressRecord> {
    const ref = seasonProgressRef(db, uid, incoming.seriesId, incoming.seasonNumber);
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const next = mergeSeasonProgress(
        snap.exists() ? snap.data() as SeasonProgressRecord : null,
        {
          ...incoming,
          uid,
          updatedAt: new Date().toISOString(),
          schemaVersion: SEASON_PROGRESS_SCHEMA_VERSION,
        },
      );
      transaction.set(ref, next, { merge: true });
      return next;
    });
  },

  async setEpisode(db: Firestore, uid: string, input: {
    seriesId: number;
    seasonNumber: number;
    episodeNumber: number;
    watched: boolean;
    runtime?: number;
    episodeCount?: number;
  }): Promise<SeasonProgressRecord> {
    const ref = seasonProgressRef(db, uid, input.seriesId, input.seasonNumber);
    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists() ? snap.data() as SeasonProgressRecord : null;
      const watchedEpisodeNumbers = uniqueEpisodeNumbers(current?.watchedEpisodeNumbers);
      const nextEpisodes = input.watched
        ? uniqueEpisodeNumbers([...watchedEpisodeNumbers, input.episodeNumber])
        : watchedEpisodeNumbers.filter((episode) => episode !== input.episodeNumber);
      const episodeDurations = { ...(current?.episodeDurations ?? {}) };
      if (input.runtime && input.runtime > 0) episodeDurations[String(input.episodeNumber)] = Math.round(input.runtime);
      const episodeCount = Math.max(Number(current?.episodeCount) || 0, Number(input.episodeCount) || 0);
      const completed = episodeCount > 0 && nextEpisodes.length >= episodeCount;
      const next: SeasonProgressRecord = {
        uid,
        seriesId: input.seriesId,
        seasonNumber: input.seasonNumber,
        watchedEpisodeNumbers: nextEpisodes,
        episodeDurations,
        episodeCount,
        watchedDurationMinutes: calculateWatchedDuration(nextEpisodes, episodeDurations),
        completedAt: completed ? (current?.completedAt ?? new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
        source: 'episode',
        schemaVersion: SEASON_PROGRESS_SCHEMA_VERSION,
      };
      transaction.set(ref, next, { merge: true });
      return next;
    });
  },

  async completeSeason(db: Firestore, uid: string, input: {
    seriesId: number;
    seasonNumber: number;
    episodeNumbers: number[];
    episodeDurations?: Record<string, number>;
    source?: SeasonProgressRecord['source'];
  }): Promise<SeasonProgressRecord> {
    return dbSeasonProgressStore.merge(db, uid, {
      uid,
      seriesId: input.seriesId,
      seasonNumber: input.seasonNumber,
      watchedEpisodeNumbers: uniqueEpisodeNumbers(input.episodeNumbers),
      episodeDurations: input.episodeDurations ?? {},
      episodeCount: uniqueEpisodeNumbers(input.episodeNumbers).length,
      completedAt: new Date().toISOString(),
      source: input.source ?? 'season-finish',
    });
  },

  subscribe(db: Firestore, uid: string, callback: (records: SeasonProgressRecord[]) => void): Unsubscribe {
    return onSnapshot(collection(db, 'users', uid, 'seasonProgress'), (snap) => {
      dataCostDebug.query('season-progress:listener', snap.size);
      callback(snap.docs.map((entry) => entry.data() as SeasonProgressRecord));
    });
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

/* ── Blocked users ──
   Unilateral, owner-only list in users/{uid}/private/blocks. Hides the
   blocked user's content client-side without exposing the relationship. */
export const dbBlockStore = {
  async get(db: Firestore, uid: string): Promise<string[]> {
    const privateBlocks = await getPrivateValue<string[]>(db, uid, 'blocks', []);
    if (privateBlocks.exists) return Array.isArray(privateBlocks.value) ? privateBlocks.value : [];
    return getField<string[]>(db, ['users', uid], 'blocked_list', []);
  },
  async block(db: Firestore, uid: string, targetUid: string): Promise<void> {
    const current = await dbBlockStore.get(db, uid);
    if (current.includes(targetUid)) return;
    await setPrivateValue(db, uid, 'blocks', [...current, targetUid]);
  },
  async unblock(db: Firestore, uid: string, targetUid: string): Promise<void> {
    const current = await dbBlockStore.get(db, uid);
    if (!current.includes(targetUid)) return;
    await setPrivateValue(db, uid, 'blocks', current.filter(u => u !== targetUid));
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
    try {
      const [{ httpsCallable }, { getFirebaseFunctions }] = await Promise.all([
        import('firebase/functions'),
        import('./firebase'),
      ]);
      const createNotification = httpsCallable<
        Pick<NotifDoc, 'recipientId' | 'type' | 'titleKey' | 'titleName' | 'poster' | 'commentSnippet' | 'link'>,
        { created: boolean }
      >(getFirebaseFunctions(), 'createSocialNotification');
      const result = await createNotification({
        recipientId: notif.recipientId,
        type: notif.type,
        titleKey: notif.titleKey,
        titleName: notif.titleName,
        poster: notif.poster,
        commentSnippet: notif.commentSnippet,
        link: notif.link,
      });
      return result.data?.created === true;
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
      const privateHistory = await getPrivateValue<LegacyEpisodeHistory>(
        db,
        uid,
        'history',
        {},
      );
      const legacyHistory = privateHistory.exists
        ? privateHistory.value
        : data?.ep_watched && typeof data.ep_watched === 'object'
          ? data.ep_watched as LegacyEpisodeHistory
          : {};
      const canonical = await dbSeasonProgressStore.getAll(db, uid);
      const migrationSnap = await getDoc(doc(db, 'users', uid, 'private', 'migration_state'));
      const canonicalIsAuthoritative = migrationSnap.data()?.seasonProgressV1 === true;
      const canonicalById = new Map(canonical.map((record) => [
        seasonProgressId(record.seriesId, record.seasonNumber),
        record,
      ]));

      // Import the legacy map only before the one-time migration marker
      // exists. Re-merging it on every login resurrected episodes that the
      // user had deliberately unmarked on another device.
      if (!canonicalIsAuthoritative) {
        for (const legacyRecord of legacyHistoryToSeasonProgress(uid, legacyHistory)) {
          const id = seasonProgressId(legacyRecord.seriesId, legacyRecord.seasonNumber);
          const current = canonicalById.get(id);
          const merged = mergeSeasonProgress(current, legacyRecord);
          canonicalById.set(id, merged);
          if (!current || merged.watchedEpisodeNumbers.length !== current.watchedEpisodeNumbers.length) {
            try { await dbSeasonProgressStore.merge(db, uid, merged); } catch {}
          }
        }
      }

      const normalizedProgress = Array.from(canonicalById.values());
      const { seasonProgressStore } = await import('./store');
      seasonProgressStore.setAll(normalizedProgress);
      // If no canonical record exists, explicitly clear the cache. This is
      // essential when a different signed-in account owns the browser.
      localStorage.setItem('sec_ep_watched_v1', JSON.stringify(
        normalizedProgress.length > 0
          ? recordsToLegacyHistory(normalizedProgress)
          : (canonicalIsAuthoritative ? {} : legacyHistory),
      ));
      const privateExpenses = await getPrivateValue<unknown[] | null>(db, uid, 'expenses', null);
      const expenses = privateExpenses.exists ? privateExpenses.value : data?.expenses;
      if (Array.isArray(expenses)) localStorage.setItem('sec_expenses_v1', JSON.stringify(expenses));
      if (Array.isArray(data?.following_list)) {
        localStorage.setItem('sec_following', JSON.stringify(data.following_list));
      }
      const privateBlocks = await getPrivateValue<string[] | null>(db, uid, 'blocks', null);
      const blocks = privateBlocks.exists ? privateBlocks.value : data?.blocked_list;
      if (Array.isArray(blocks)) localStorage.setItem('sec_blocked', JSON.stringify(blocks));
      const privatePrefs = await getPrivateValue<Prefs | null>(db, uid, 'preferences', null);
      const prefs = privatePrefs.exists ? privatePrefs.value : data?.prefs;
      if (prefs && typeof prefs === 'object') {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
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

type LegacyRatingCandidate = {
  titleId: string;
  rating: number;
  sourceReviewId?: string;
  updatedAt: string;
};

const RATING_TITLE_KEY = /^(?:movie|tv)_\d+$|^ep_\d+_s\d+_e\d+$/;

function legacyRatingTime(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Independent ratingsV1 migration.
 *
 * The original account migration can already be marked complete through
 * `seasonProgressV1`, even when its legacy review/rating loop never ran.
 * Ratings therefore have their own per-device fingerprint. A device that
 * still owns legacy ratings uploads only missing title documents; an existing
 * Firestore rating always wins. If legacy cache later appears on this device,
 * its changed fingerprint safely runs the migration again.
 */
export async function migrateLocalRatingsToFirestore(
  db: Firestore,
  uid: string,
  authName?: string | null,
  email?: string | null,
): Promise<{ candidates: number; imported: number; preserved: number }> {
  if (typeof window === 'undefined' || !uid) {
    return { candidates: 0, imported: 0, preserved: 0 };
  }

  const { profileStore } = await import('./store');
  const profile = profileStore.get(uid);
  const legacyNames = new Set(
    [
      profile.username,
      profile.name,
      authName,
      email?.split('@')[0],
    ]
      .map((value) => String(value || '').trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const allReviews: Record<string, Review[]> = (() => {
    try {
      const value = JSON.parse(localStorage.getItem('sec_reviews_v1') || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  })();

  const byTitle = new Map<string, LegacyRatingCandidate>();
  Object.entries(allReviews).forEach(([titleId, reviews]) => {
    if (!RATING_TITLE_KEY.test(titleId) || !Array.isArray(reviews)) return;
    reviews.forEach((review) => {
      const rating = Number(review.rating);
      if (!Number.isFinite(rating) || rating <= 0) return;
      const ownsByUid = review.uid === uid;
      const legacyAuthor = String(review.user || '').trim().toLocaleLowerCase();
      const ownsLegacyReview = !review.uid && legacyNames.has(legacyAuthor);
      if (!ownsByUid && !ownsLegacyReview) return;

      const candidate: LegacyRatingCandidate = {
        titleId,
        rating: Math.max(1, Math.min(10, Math.round(rating))),
        sourceReviewId: review.id || undefined,
        updatedAt: review.date || '',
      };
      const current = byTitle.get(titleId);
      if (!current || legacyRatingTime(candidate.updatedAt) > legacyRatingTime(current.updatedAt)) {
        byTitle.set(titleId, candidate);
      }
    });
  });

  const candidates = Array.from(byTitle.values()).sort((a, b) => a.titleId.localeCompare(b.titleId));
  const fingerprint = JSON.stringify(candidates.map((candidate) => [
    candidate.titleId,
    candidate.rating,
    candidate.sourceReviewId || '',
    candidate.updatedAt,
  ]));
  const migratedKey = `sec_ratings_migrated_v1_${uid}`;
  if (localStorage.getItem(migratedKey) === fingerprint) {
    return { candidates: candidates.length, imported: 0, preserved: candidates.length };
  }

  let imported = 0;
  let preserved = 0;
  for (const candidate of candidates) {
    const created = await dbRatingStore.setIfMissing(
      db,
      candidate.titleId,
      uid,
      candidate.rating,
      candidate.sourceReviewId,
    );
    if (created) imported += 1;
    else preserved += 1;
  }

  // Written only after every candidate succeeds. A failed/offline migration
  // remains retryable, and a changed local fingerprint is never suppressed.
  localStorage.setItem(migratedKey, fingerprint);
  window.dispatchEvent(new Event('maratonou:sync'));
  console.info(
    `[DB] ratingsV1 migrated to Firestore (${imported} imported, ${preserved} preserved)`,
  );
  return { candidates: candidates.length, imported, preserved };
}

export async function migrateLocalToFirestore(db: Firestore, uid: string) {
  if (typeof window === 'undefined') return;
  const MIGRATED_KEY = `sec_migrated_${uid}`;
  const migrationRef = doc(db, 'users', uid, 'private', 'migration_state');
  try {
    const migrationSnap = await getDoc(migrationRef);
    if (migrationSnap.data()?.seasonProgressV1 === true) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return;
    }
  } catch {
    // Offline migration can still proceed idempotently; deterministic IDs and
    // merge transactions make a retry safe.
    if (localStorage.getItem(MIGRATED_KEY)) return;
  }

  try {
    const { listStore, revStore, profileStore, prefsStore, proSettingsStore, epWatchedStore } = await import('./store');

    const profile = profileStore.get(uid);
    if (profile.name) await dbProfileStore.set(db, uid, profile);

    for (const type of ['want', 'watching', 'watched', 'favorites'] as ListType[]) {
      const localItems = listStore.get(type);
      const remoteItems = await dbListStore.get(db, uid, type);
      const byId = new Map(remoteItems.map((item) => [`${item.type}:${item.id}`, item]));
      localItems.forEach((item) => byId.set(`${item.type}:${item.id}`, item));
      const mergedItems = Array.from(byId.values());
      if (mergedItems.length) await setField(db, ['users', uid], `lists_${type}`, mergedItems);
    }

    const prefs = prefsStore.get();
    if (Object.keys(prefs).length) await dbPrefsStore.set(db, uid, prefs);

    // A fresh device has no local PRO document. Never upload defaults before
    // the initial Firestore pull, otherwise valid remote reminders are lost.
    if (localStorage.getItem(proSettingsKey(uid))) {
      await dbProSettingsStore.set(db, uid, proSettingsStore.get(uid));
    }

    // Merge legacy episode history instead of replacing the remote map.
    const localHistory = epWatchedStore.getAll();
    const privateHistory = await getPrivateValue<LegacyEpisodeHistory>(db, uid, 'history', {});
    const remoteHistory = privateHistory.exists
      ? privateHistory.value
      : await getField<LegacyEpisodeHistory>(db, ['users', uid], 'ep_watched', {});
    const mergedHistory: LegacyEpisodeHistory = structuredClone(remoteHistory);
    for (const [seriesId, seasons] of Object.entries(localHistory)) {
      mergedHistory[seriesId] ??= {};
      for (const [seasonNumber, episodes] of Object.entries(seasons)) {
        mergedHistory[seriesId][seasonNumber] = uniqueEpisodeNumbers([
          ...(mergedHistory[seriesId][seasonNumber] ?? []),
          ...episodes,
        ]);
      }
    }
    if (Object.keys(mergedHistory).length) {
      await setPrivateValue(db, uid, 'history', mergedHistory);
      const completedSeries = new Set(listStore.get('watched')
        .filter((item) => item.type === 'tv')
        .map((item) => item.id));
      for (const record of legacyHistoryToSeasonProgress(uid, mergedHistory)) {
        if (completedSeries.has(record.seriesId)) {
          record.episodeCount = record.watchedEpisodeNumbers.length;
          record.completedAt = record.updatedAt;
        }
        await dbSeasonProgressStore.merge(db, uid, record);
      }
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

    await setDoc(migrationRef, {
      seasonProgressV1: true,
      privateDataV1: true,
      seasonProgressMigratedAt: new Date().toISOString(),
      privateDataMigratedAt: new Date().toISOString(),
      schemaVersion: SEASON_PROGRESS_SCHEMA_VERSION,
    }, { merge: true });
    localStorage.setItem(MIGRATED_KEY, '1');
    console.info('[DB] localStorage migrated to Firestore ✓');
  } catch (e) {
    console.warn('[DB] Migration failed', e);
  }
}
