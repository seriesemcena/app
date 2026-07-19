/* ─────────────────────────────────────────────────────────────
   Username helpers — the profile URL is derived from the user's
   Name: "João Miguel" → "joao-miguel" → /user/joao-miguel
   ───────────────────────────────────────────────────────────── */

export const USERNAME_FALLBACK = 'usuario';
export const USERNAME_MAX = 30;

// Combining diacritical marks, stripped after NFD normalisation.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Turn a display name into a URL-safe username slug.
 * Strips accents, lowercases, and collapses anything non-alphanumeric
 * into single hyphens. Returns '' when nothing usable remains.
 */
export function slugifyUsername(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(DIACRITICS, '')         // João → Joao
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // spaces/punctuation → hyphen
    .replace(/-{2,}/g, '-')          // collapse repeats
    .replace(/^-+|-+$/g, '')         // trim edges
    .slice(0, USERNAME_MAX)
    .replace(/-+$/, '');             // trailing hyphen left by the slice
}

/** Slug for a name, falling back to the email prefix, then a constant. */
export function usernameFromNameOrEmail(name?: string | null, email?: string | null): string {
  return (
    slugifyUsername(name || '') ||
    slugifyUsername((email || '').split('@')[0]) ||
    USERNAME_FALLBACK
  );
}

/** Candidate list for collisions: joao-miguel, joao-miguel-2, joao-miguel-3, … */
export function usernameCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, USERNAME_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
}
