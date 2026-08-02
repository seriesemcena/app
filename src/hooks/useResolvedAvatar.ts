'use client';
import { useEffect, useState } from 'react';
import { profileStore } from '@/lib/store';
import { dbProfileStore } from '@/lib/db';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Resolves a member's *current* avatar instead of the one snapshotted into a
 * feed activity or comment when it was written. Denormalized copies go stale
 * the moment someone changes their picture, which showed the same member with
 * two different avatars across older and newer posts.
 *
 * Resolution order: the signed-in user's own live profile (for their own
 * content), then the author's Firestore profile by uid, falling back to the
 * stored snapshot while those load or when there is no uid.
 */
export function useResolvedAvatar(
  uid: string | undefined,
  fallbackPhotoUrl: string | undefined,
  fallbackUsername?: string,
): string {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState(fallbackPhotoUrl || '');

  useEffect(() => {
    let cancelled = false;
    const localProfile = profileStore.get(user?.uid);
    const belongsToCurrentUser = !!user && (
      uid === user.uid
      || (!uid && !!localProfile.username && fallbackUsername === localProfile.username)
    );
    const localAvatar = belongsToCurrentUser
      ? localProfile.avatarThumbImage || localProfile.avatarImage || user.photoURL || ''
      : '';

    setAvatarUrl(localAvatar || fallbackPhotoUrl || '');

    if (!uid || !firebaseConfigured) return () => { cancelled = true; };

    void dbProfileStore.getOptional(getDB(), uid).then((profile) => {
      if (cancelled || !profile) return;
      const current = profile.avatarThumbImage || profile.avatarImage || '';
      if (current) setAvatarUrl(current);
    });

    return () => { cancelled = true; };
  }, [uid, fallbackPhotoUrl, fallbackUsername, user]);

  return avatarUrl;
}
