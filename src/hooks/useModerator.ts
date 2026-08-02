'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const MODERATOR_ROLES = ['super_admin', 'admin', 'moderator', 'support'];

/**
 * Whether the signed-in user may moderate community content (delete other
 * members' replies, etc.). Mirrors `canModerateCommunity()` in firestore.rules
 * by reading the same custom claims from the ID token. The rules remain the
 * real gate — this only decides whether to render the moderation control.
 */
export function useModerator(): boolean {
  const { user } = useAuth();
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setIsModerator(false); return; }
    user.getIdTokenResult()
      .then((result) => {
        if (cancelled) return;
        const isAdmin = result.claims.admin === true;
        const role = String(result.claims.role || '');
        setIsModerator(isAdmin && MODERATOR_ROLES.includes(role));
      })
      .catch(() => { if (!cancelled) setIsModerator(false); });
    return () => { cancelled = true; };
  }, [user]);

  return isModerator;
}
