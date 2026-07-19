import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sectime.app',
  appName: 'Maratonou',
  webDir: 'out',            // Next.js static export output folder

  /* ── Development: point to local/Vercel dev server ──────────────
     Comment this block out for PRODUCTION builds so the app
     bundles the static export instead of loading a remote URL.
     ─────────────────────────────────────────────────────────────── */
  ...(process.env.CAPACITOR_SERVER_URL ? {
    server: {
      // For local dev use a LAN URL; production omits this block and bundles `out`.
      url: process.env.CAPACITOR_SERVER_URL,
      cleartext: process.env.CAPACITOR_SERVER_URL.startsWith('http://'),
      androidScheme: 'https',
    },
  } : {}),

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    /* iOS: request notification permission automatically on launch */
    LocalNotifications: {
      smallIcon:    'ic_stat_icon_config_sample',
      iconColor:    '#E050C8',
      sound:        'beep.wav',
    },
  },

  android: {
    buildOptions: {
      keystorePath:   'android/app/sectime.keystore',
      keystoreAlias:  'sectime',
    },
  },

  ios: {
    // CSS env(safe-area-inset-*) is the single source of truth.
    contentInset: 'never',
  },
};

export default config;
