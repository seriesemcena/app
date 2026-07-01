import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sectime.app',
  appName: 'SEC TIME',
  webDir: 'out',            // Next.js static export output folder

  /* ── Development: point to local/Vercel dev server ──────────────
     Comment this block out for PRODUCTION builds so the app
     bundles the static export instead of loading a remote URL.
     ─────────────────────────────────────────────────────────────── */
  server: {
    // For local dev: 'http://192.168.x.x:3000' (use your LAN IP, not localhost)
    // For staging:   'https://your-app.vercel.app'
    url: process.env.CAPACITOR_SERVER_URL ?? 'https://your-app.vercel.app',
    cleartext: false,       // set true only for http:// local dev
    androidScheme: 'https',
  },

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
    contentInset: 'automatic',
  },
};

export default config;
