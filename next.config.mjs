/** @type {import('next').NextConfig} */

/**
 * MOBILE BUILD: set NEXT_MOBILE=1 to produce a static export
 * for Capacitor. API routes are excluded — the mobile app calls
 * the deployed Vercel backend at NEXT_PUBLIC_API_URL.
 *
 * WEB BUILD (default): standard Next.js with API routes.
 */
const isMobile = process.env.NEXT_MOBILE === '1';

const nextConfig = {
  reactStrictMode: true,

  /* Static export for Capacitor (no API routes in bundle) */
  ...(isMobile ? { output: 'export', trailingSlash: true } : {}),

  images: {
    /* Required for next/image in static export mode */
    unoptimized: isMobile,
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
