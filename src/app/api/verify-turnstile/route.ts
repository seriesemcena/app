import { NextRequest, NextResponse } from 'next/server';

/* ─────────────────────────────────────────────────────────────
   Server-side Cloudflare Turnstile verification.

   The client posts the widget token here before creating an
   account; we exchange it (with the secret key) against Cloudflare's
   siteverify endpoint. When TURNSTILE_SECRET_KEY is not configured
   the route succeeds unconditionally, so unconfigured / local envs
   never block sign-ups.
   ───────────────────────────────────────────────────────────── */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function POST(req: NextRequest) {
  // Not configured — don't gate registration.
  if (!SECRET) return NextResponse.json({ success: true, skipped: true });

  let token = '';
  try {
    const body = await req.json();
    token = typeof body?.token === 'string' ? body.token : '';
  } catch {}
  if (!token) {
    return NextResponse.json({ success: false, error: 'missing-token' }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.append('secret', SECRET);
  form.append('response', token);
  const ip =
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '';
  if (ip) form.append('remoteip', ip);

  try {
    const r = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const data = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
    return NextResponse.json({
      success: data.success === true,
      codes: data['error-codes'] ?? [],
    });
  } catch {
    return NextResponse.json({ success: false, error: 'verify-failed' }, { status: 502 });
  }
}
