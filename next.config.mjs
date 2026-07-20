/** @type {import('next').NextConfig} */

/**
 * MOBILE BUILD: set NEXT_MOBILE=1 to produce a static export
 * for Capacitor. API routes are excluded — the mobile app calls
 * the deployed Vercel backend at NEXT_PUBLIC_API_URL.
 *
 * WEB BUILD (default): standard Next.js with API routes.
 */
const isMobile = process.env.NEXT_MOBILE === '1';
const isDev    = process.env.NODE_ENV !== 'production';

/* Content-Security-Policy tuned to what the app actually loads:
   - Firestore/Auth/FCM talk to *.googleapis.com (WebChannel over https)
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
  `connect-src 'self' https://*.googleapis.com https://*.google.com https://api.tvmaze.com https://www.recaptcha.net${isDev ? ' ws: wss:' : ''}`,
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

  /* Static export for Capacitor (no API routes in bundle) */
  ...(isMobile ? { output: 'export', trailingSlash: true } : {}),

  /* headers() is unsupported in static export mode — web build only */
  ...(isMobile ? {} : {
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
        { source: '/api/ai', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
        { source: '/api/curadoria', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
        { source: '/(.*)', headers: securityHeaders },
      ];
    },
  }),

  turbopack: {
    root: process.cwd(),
  },

  images: {
    /* Required for next/image in static export mode */
    unoptimized: isMobile,
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
