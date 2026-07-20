'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseConfigured, getDB } from '@/lib/firebase';
import { cachedRequest } from '@/lib/cache';
import { CACHE_TTL } from '@/lib/dataPolicy';
import { dataCostDebug } from '@/lib/devDataMetrics';

export type AppSettings = {
  maintenanceMode: boolean;
  registrationsEnabled: boolean;
  reviewsEnabled: boolean;
  commentsEnabled: boolean;
  proEnabled: boolean;
  defaultLocale: string;
  defaultRegion: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  maintenanceMode: false,
  registrationsEnabled: true,
  reviewsEnabled: true,
  commentsEnabled: true,
  proEnabled: true,
  defaultLocale: 'pt-BR',
  defaultRegion: 'BR',
};

const AppSettingsContext = createContext<{ settings: AppSettings; loading: boolean }>({
  settings: DEFAULT_APP_SETTINGS,
  loading: true,
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured) { setLoading(false); return; }
    let active = true;
    const load = async (force = false) => {
      try {
        const value = await cachedRequest('config:app-settings', CACHE_TTL.appConfig, async () => {
          const snapshot = await getDoc(doc(getDB(), 'config', 'app_settings'));
          dataCostDebug.query('config:app-settings', snapshot.exists() ? 1 : 0);
          return snapshot.data() as Partial<AppSettings> | undefined;
        }, { force, staleIfError: true });
        if (active) setSettings({ ...DEFAULT_APP_SETTINGS, ...value });
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);

  return <AppSettingsContext.Provider value={{ settings, loading }}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
