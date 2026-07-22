'use client';
import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react';
import '@/lib/i18n';
import i18next from 'i18next';
import { useAuthContext } from '@/context/AuthContext';
import { formatDate, formatNumber, formatCurrency, formatRelativeTime } from '@/lib/locale-utils';

export const LOCALE_KEY   = 'sec_locale_v1';
export const COUNTRY_KEY  = 'sec_country_v1';
export const DEFAULT_LOCALE  = 'pt-BR';
export const DEFAULT_COUNTRY = 'BR';

export const SUPPORTED_LOCALES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (US)'        },
  { code: 'es-ES', label: 'Español (España)'    },
  { code: 'es-MX', label: 'Español (México)'    },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'fr-FR', label: 'Français'             },
  { code: 'de-DE', label: 'Deutsch'              },
  { code: 'it-IT', label: 'Italiano'             },
  { code: 'ja-JP', label: '日本語'               },
  { code: 'ko-KR', label: '한국어'               },
  { code: 'en-GB', label: 'English (UK)'         },
] as const;

interface LocaleCtxValue {
  locale:    string;
  country:   string;
  setLocale:  (l: string) => void;
  setCountry: (c: string) => void;
  formatDate:          typeof formatDate;
  formatNumber:        typeof formatNumber;
  formatCurrency:      typeof formatCurrency;
  formatRelativeTime:  typeof formatRelativeTime;
}

const LocaleCtx = createContext<LocaleCtxValue>({
  locale:   DEFAULT_LOCALE,
  country:  DEFAULT_COUNTRY,
  setLocale:  () => {},
  setCountry: () => {},
  formatDate,
  formatNumber,
  formatCurrency,
  formatRelativeTime,
});

function readSaved() {
  if (typeof window === 'undefined') return { locale: DEFAULT_LOCALE, country: DEFAULT_COUNTRY };
  try {
    const l = localStorage.getItem(LOCALE_KEY)  || DEFAULT_LOCALE;
    const c = localStorage.getItem(COUNTRY_KEY) || DEFAULT_COUNTRY;
    return { locale: l, country: c };
  } catch {
    return { locale: DEFAULT_LOCALE, country: DEFAULT_COUNTRY };
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();

  const [locale,  setLocaleState]  = useState<string>(DEFAULT_LOCALE);
  const [country, setCountryState] = useState<string>(DEFAULT_COUNTRY);

  /* On mount, read from localStorage */
  useEffect(() => {
    const { locale: l, country: c } = readSaved();
    setLocaleState(l);
    setCountryState(c);
    if (i18next.language !== l) i18next.changeLanguage(l);
    document.documentElement.lang = l;
  }, []);

  /* When auth user loads, check if they have a saved locale in Firestore */
  useEffect(() => {
    if (!user) return;
    import('@/lib/db').then(({ dbPrefsStore }) => {
      import('@/lib/firebase').then(({ getDB }) => {
        dbPrefsStore.get(getDB(), user.uid).then((prefs) => {
          const saved = readSaved();
          const nextLocale = prefs.locale || saved.locale;
          const nextCountry = prefs.country || saved.country;

          if (nextLocale !== locale) {
            applyLocale(nextLocale);
          }
          if (nextCountry !== country) {
            setCountryState(nextCountry);
            try { localStorage.setItem(COUNTRY_KEY, nextCountry); } catch {}
          }
          if (!prefs.locale || !prefs.country) {
            dbPrefsStore.set(getDB(), user.uid, {
              ...prefs,
              locale: nextLocale,
              country: nextCountry,
            }).catch(() => {});
          }
        }).catch(() => {});
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  function applyLocale(l: string) {
    setLocaleState(l);
    i18next.changeLanguage(l);
    document.documentElement.lang = l;
    try { localStorage.setItem(LOCALE_KEY, l); } catch {}
  }

  const setLocale = useCallback((l: string) => {
    applyLocale(l);
    if (user) {
      import('@/lib/db').then(({ dbPrefsStore }) => {
        import('@/lib/firebase').then(({ getDB }) => {
          dbPrefsStore.get(getDB(), user.uid).then((prefs) => {
            dbPrefsStore.set(getDB(), user.uid, { ...prefs, locale: l });
          }).catch(() => {});
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const setCountry = useCallback((c: string) => {
    setCountryState(c);
    try { localStorage.setItem(COUNTRY_KEY, c); } catch {}
    if (user) {
      import('@/lib/db').then(({ dbPrefsStore }) => {
        import('@/lib/firebase').then(({ getDB }) => {
          dbPrefsStore.get(getDB(), user.uid).then((prefs) => {
            dbPrefsStore.set(getDB(), user.uid, { ...prefs, country: c });
          }).catch(() => {});
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const boundFormatDate = useCallback(
    (d: Date | string, opts?: Intl.DateTimeFormatOptions) => formatDate(d, locale, opts),
    [locale],
  );
  const boundFormatNumber = useCallback(
    (n: number, opts?: Intl.NumberFormatOptions) => formatNumber(n, locale, opts),
    [locale],
  );
  const boundFormatCurrency = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currency, locale),
    [locale],
  );
  const boundFormatRelative = useCallback(
    (d: Date | string) => formatRelativeTime(d, locale),
    [locale],
  );

  return (
    <LocaleCtx.Provider value={{
      locale,
      country,
      setLocale,
      setCountry,
      formatDate:         boundFormatDate         as typeof formatDate,
      formatNumber:       boundFormatNumber       as typeof formatNumber,
      formatCurrency:     boundFormatCurrency     as typeof formatCurrency,
      formatRelativeTime: boundFormatRelative     as typeof formatRelativeTime,
    }}>
      {children}
    </LocaleCtx.Provider>
  );
}

export const useLocale = () => useContext(LocaleCtx);
