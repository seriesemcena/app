'use client';
/* ─────────────────────────────────────────────────────────────
   Resolves the signed-in user's canonical profile URL.
   The profile lives at a single route: /user/<username>
   ───────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { profileStore } from '@/lib/store';
import { usernameFromNameOrEmail } from '@/lib/username';

/** The signed-in user's username, or '' when unknown/logged out. */
export function useMyUsername(): string {
  const { user } = useAuthContext();
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!user) { setUsername(''); return; }
    const read = () => {
      const p = profileStore.get(user.uid);
      setUsername(p.username || usernameFromNameOrEmail(p.name || user.displayName, user.email));
    };
    read();
    // subscribeUserDoc fires this after a Firestore sync (e.g. username migration)
    window.addEventListener('maratonou:sync', read);
    return () => window.removeEventListener('maratonou:sync', read);
  }, [user]);

  return username;
}

/** Route to the signed-in user's profile, or /auth when logged out. */
export function useMyProfileUrl(): string {
  const { user } = useAuthContext();
  const username = useMyUsername();
  if (!user) return '/auth';
  return username ? `/user/${encodeURIComponent(username)}` : '/profile';
}
