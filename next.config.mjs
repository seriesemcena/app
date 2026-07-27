/** @type {import('next').NextConfig} */

const isDev    = process.env.NODE_ENV !== 'production';

/* Content-Security-Policy tuned to what the app actually loads:
   - Firestore/Auth/FCM talk to *.googleapis.com (WebChannel over https)
   - Authenticated callable functions use *.cloudfunctions.net
   - Firebase social sign-in mounts a helper iframe on *.firebaseapp.com
   - Google Fonts (stylesheet + woff2), TMDB/Giphy/news images over https
   - 'unsafe-inline' scripts: required by Next hydration + the anti-FOUC
     inline scripts in layout.tsx; 'unsafe-eval' only exists in dev (HMR). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.recaptcha.net https://www.gstatic.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  `connect-src 'self' https://*.googleapis.com https://*.google.com https://*.cloudfunctions.net https://api.tvmaze.com https://www.recaptcha.net${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://appleid.apple.com https://www.recaptcha.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: csp },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  reactStrictMode: true,

  /* Codex/Claude previews access the local dev server through 127.0.0.1. */
  ...(isDev ? { allowedDevOrigins: ['127.0.0.1'] } : {}),

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/firebase-messaging-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0' }],
      },
      {
        // Apple requires the AASA to be served as JSON (never text/html) so
        // Universal Links can validate the domain association.
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      { source: '/api/ai', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      { source: '/api/curadoria', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      // Everything EXCEPT the proxied Firebase auth handler (/__/…), which must
      // serve Firebase's own page without our strict CSP interfering.
      { source: '/((?!__).*)', headers: securityHeaders },
    ];
  },

  async rewrites() {
    // Reverse-proxy Firebase Auth's sign-in helper under our own domain, so the
    // OAuth flow and Google's "Continue to …" screen show maratonou.com instead
    // of maratonou-f5d93.firebaseapp.com. Serving the handler same-site also
    // restores popup sign-in (no third-party storage). Harmless until authDomain
    // is switched to maratonou.com — until then nothing routes through here.
    return [
      { source: '/__/auth/:path*',     destination: 'https://maratonou-f5d93.firebaseapp.com/__/auth/:path*' },
      { source: '/__/firebase/:path*', destination: 'https://maratonou-f5d93.firebaseapp.com/__/firebase/:path*' },
    ];
  },

  turbopack: {
    root: process.cwd(),
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
