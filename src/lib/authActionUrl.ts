/* ─────────────────────────────────────────────────────────────
   Helpers for the Firebase Auth action handler (/auth/action).

   The continueUrl that Firebase appends to an e-mail link is
   attacker-influenceable, so it is validated against a strict
   allowlist before any redirect — no open redirects, https only in
   production, and only Maratonou-owned hosts.
   ───────────────────────────────────────────────────────────── */

/** Maratonou-owned hosts a post-action redirect is allowed to land on. */
export const ALLOWED_CONTINUE_HOSTS = ['maratonou.com', 'www.maratonou.com'] as const;

function isDevRuntime(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

/**
 * Validate a continueUrl and return a safe absolute URL, or null when it must
 * be rejected. Rules:
 *  - must parse as an absolute URL;
 *  - production: scheme must be https and host must be on the allowlist;
 *  - development: also allows http://localhost / 127.0.0.1 so the flow is
 *    testable locally.
 * Anything else (other hosts, non-https in prod, javascript:, data:, relative
 * paths) returns null so the caller falls back to a fixed internal default.
 */
export function resolveSafeContinueUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // relative or malformed — never trust it
  }

  const dev = isDevRuntime();
  const isLocalDevHost = dev && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  // Scheme: https always; http only for local dev hosts.
  if (url.protocol !== 'https:' && !(isLocalDevHost && url.protocol === 'http:')) {
    return null;
  }

  const allowed =
    (ALLOWED_CONTINUE_HOSTS as readonly string[]).includes(url.hostname) || isLocalDevHost;
  if (!allowed) return null;

  return url.toString();
}

/**
 * Non-reversible short key derived from the oobCode, used only as a
 * sessionStorage key so a page refresh can restore the completed result
 * without re-calling Firebase — without ever persisting the code itself.
 */
export function actionResultKey(mode: string, oobCode: string): string {
  const input = `${mode}:${oobCode}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0; // djb2
  }
  return `maratonou:auth-action:${hash.toString(36)}`;
}
