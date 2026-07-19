/* ─────────────────────────────────────────────────────────────
   Admin allowlist — deny by default.

   NEXT_PUBLIC_ADMIN_EMAILS (comma-separated) names the accounts with
   moderation powers: the /admin panel and editing/deleting ANY
   comment/review. Exposing the list in the bundle is fine — power is
   granted by BEING signed in as one of these accounts, not by knowing
   the list, and the Firestore rules enforce the same emails
   server-side (isAdmin() in firestore.rules). Keep both in sync.
   ───────────────────────────────────────────────────────────── */

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminUser(user: { email?: string | null } | null | undefined): boolean {
  return !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
}
