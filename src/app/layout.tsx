import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

export const metadata: Metadata = {
  title: 'Séries em Cena',
  description: 'Seu guia de filmes e séries',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)',  color: '#0D0D0F' },
  ],
};

/* Inline script runs before hydration to prevent flash of wrong theme */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('sec_theme_v1');
    var active = (t === 'light' || t === 'dark') ? t : 'light';
    document.documentElement.setAttribute('data-theme', active);
  } catch(e){}
})();
`;

/* Register SW on every page so PWA scope covers all routes */
const swScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function() {});
  });
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/logo_dark.png" />
      </head>
      <body>
        {/* Anti-FOUC: set theme before first paint */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Register SW on all pages so PWA scope covers every route */}
        <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: swScript }} />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
