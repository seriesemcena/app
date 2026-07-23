/// <reference types="@capacitor-firebase/authentication" />
/// <reference types="@capacitor-firebase/messaging" />

import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.maratonou.app',
  appName: 'Maratonou',
  /*
   * The Next.js application has dynamic routes and server APIs, so the native
   * shell loads the deployed application instead of an incomplete static
   * export. `native-shell` is still bundled as a valid fallback asset set.
   */
  webDir: 'native-shell',

  /* ── Hosted Next.js runtime ─────────────────────────────────────
     The npm scripts provide the production URL by default. Override
     CAPACITOR_SERVER_URL with a LAN/local URL only while developing.
     ─────────────────────────────────────────────────────────────── */
  ...(serverUrl ? {
    server: {
      // Production uses https://maratonou.com; local device testing may use a LAN URL.
      url: serverUrl,
      cleartext: serverUrl.startsWith('http://'),
      androidScheme: 'https',
    },
  } : {}),

  plugins: {
    FirebaseAuthentication: {
      // Social sign-in runs through the native provider UI, then the returned
      // credential signs the Firebase JavaScript SDK into the same account.
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
    FirebaseMessaging: {
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
