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

/**
 * Like useResolvedAvatar, but resolves the author's current display **name**,
 * **username** and avatar together (one profile read). Used where we show
 * "Name @username" — the feed and review cards — so both stay in sync with the
 * member's live profile instead of the snapshot stored on the post.
 */
export function useResolvedAuthor(
  uid: string | undefined,
  fallbackName?: string,
  fallbackUsername?: string,
  fallbackPhotoUrl?: string,
): { name: string; username: string; avatarUrl: string; pro: boolean } {
  const { user } = useAuth();
  const [author, setAuthor] = useState({
    name: fallbackName || fallbackUsername || '',
    username: fallbackUsername || '',
    avatarUrl: fallbackPhotoUrl || '',
    pro: false,
  });

  useEffect(() => {
    let cancelled = false;
    const localProfile = profileStore.get(user?.uid);
    const belongsToCurrentUser = !!user && (
      uid === user.uid
      || (!uid && !!localProfile.username && fallbackUsername === localProfile.username)
    );
    if (belongsToCurrentUser) {
      setAuthor({
        name: localProfile.name || user.displayName || fallbackName || fallbackUsername || '',
        username: localProfile.username || fallbackUsername || '',
        avatarUrl: localProfile.avatarThumbImage || localProfile.avatarImage || user.photoURL || fallbackPhotoUrl || '',
        pro: localProfile.proMember === true,
      });
    } else {
      setAuthor({
        name: fallbackName || fallbackUsername || '',
        username: fallbackUsername || '',
        avatarUrl: fallbackPhotoUrl || '',
        pro: false,
      });
    }

    if (!uid || !firebaseConfigured) return () => { cancelled = true; };
    void dbProfileStore.getOptional(getDB(), uid).then((profile) => {
      if (cancelled || !profile) return;
      setAuthor({
        name: profile.name || fallbackName || fallbackUsername || '',
        username: profile.username || fallbackUsername || '',
        avatarUrl: profile.avatarThumbImage || profile.avatarImage || fallbackPhotoUrl || '',
        pro: profile.proMember === true,
      });
    });
    return () => { cancelled = true; };
  }, [uid, fallbackName, fallbackUsername, fallbackPhotoUrl, user]);

  return author;
}
