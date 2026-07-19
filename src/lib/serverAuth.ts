/* ─────────────────────────────────────────────────────────────
   serverAuth — API-route protection (server-side only).

   verifyIdToken: validates a Firebase ID token WITHOUT the Admin
   SDK (no service account in this project) by calling the Identity
   Toolkit REST API. Verified tokens are cached in memory for a few
   minutes so each warm serverless instance does ~1 lookup per user.

   rateLimit: small in-memory sliding-window limiter. On serverless
   this is per warm instance — it caps bursts rather than acting as
   a hard global quota, which is enough to stop casual abuse of the
   paid AI endpoints. Swap for Upstash/Vercel KV if it ever needs
   to be exact.
   ───────────────────────────────────────────────────────────── */

const TOKEN_CACHE_TTL = 5 * 60_000;
const TOKEN_CACHE_MAX = 500;

const tokenCache = new Map<string, { uid: string; exp: number }>();

/**
 * Returns the uid for a valid `Authorization: Bearer <idToken>` header,
 * or null when the header is missing/invalid. When Firebase itself is
 * not configured (local dev without .env) there is nothing to verify
 * against and no cost to protect — callers should skip the check then.
 */
export async function verifyIdToken(authHeader: string | null): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;

  const idToken = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!idToken) return null;

  const hit = tokenCache.get(idToken);
  if (hit && hit.exp > Date.now()) return hit.uid;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const uid: string | undefined = data?.users?.[0]?.localId;
    if (!uid) return null;

    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      // Drop the stalest half rather than tracking LRU order.
      const now = Date.now();
      for (const [k, v] of tokenCache) {
        if (v.exp <= now) tokenCache.delete(k);
      }
      if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.clear();
    }
    tokenCache.set(idToken, { uid, exp: Date.now() + TOKEN_CACHE_TTL });
    return uid;
  } catch {
    return null;
  }
}

const buckets = new Map<string, number[]>();

/** True when `key` may proceed; false once it exceeds max hits per window. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (hits.length >= max) { buckets.set(key, hits); return false; }
  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (v.every(t => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}
