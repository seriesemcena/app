'use client';
/* ─────────────────────────────────────────────────────────────
   /profile is no longer a page of its own — the profile lives at
   the single canonical route /user/<username>. This redirect keeps
   old links, bookmarks and installed-PWA shortcuts working.
   ───────────────────────────────────────────────────────────── */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Frame } from '@/components/Frame';
import { Screen } from '@/components/primitives';
import { useAuth } from '@/hooks/useAuth';
import { useMyUsername } from '@/hooks/useMyProfileUrl';

export default function ProfileRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const username = useMyUsername();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/auth'); return; }
    if (username) router.replace(`/user/${encodeURIComponent(username)}`);
  }, [user, loading, username, router]);

  return (
    <Frame>
      <Screen>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: 32 }}>
          <div style={{ width: 88, height: 88, borderRadius: 44, background: 'var(--c-glass-bg)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ width: 140, height: 16, borderRadius: 8, background: 'var(--c-glass-bg)' }} />
        </div>
      </Screen>
    </Frame>
  );
}
