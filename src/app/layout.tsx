import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { LocaleProvider } from '@/context/LocaleContext';
import { AppRuntimeProvider } from '@/context/AppRuntimeContext';
import { AppBootstrap } from '@/components/AppBootstrap';

export const metadata: Metadata = {
  title: {
    default: 'Maratonou',
    template: '%s · Maratonou',
  },
  description: 'Seu guia de filmes e séries',
  applicationName: 'Maratonou',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Maratonou',
    statusBarStyle: 'black-translucent',
  },
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

/* Inline script runs before hydration to prevent flash of wrong locale */
const localeScript = `
(function(){
  try {
    var l = localStorage.getItem('sec_locale_v1');
    if (l) document.documentElement.lang = l;
  } catch(e){}
})();
`;

/* Inline script runs before hydration to prevent flash of wrong theme */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('sec_theme_v1');
    var active = (t === 'light' || t === 'dark') ? t : 'dark';
    document.documentElement.setAttribute('data-theme', active);
  } catch(e){}
})();
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
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Anti-FOUC scripts must be in head; rendering beforeInteractive Script in body logs React errors. */}
        <Script id="locale-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: localeScript }} />
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppRuntimeProvider>
            <AuthProvider>
              <LocaleProvider>
                <AppBootstrap>{children}</AppBootstrap>
              </LocaleProvider>
            </AuthProvider>
          </AppRuntimeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
