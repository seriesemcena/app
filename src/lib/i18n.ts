import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// ── pt-BR (full) ─────────────────────────────────────────────
import ptBRNav    from '@/locales/pt-BR/navigation.json';
import ptBRCommon from '@/locales/pt-BR/common.json';
import ptBRAuth   from '@/locales/pt-BR/auth.json';
import ptBRHome   from '@/locales/pt-BR/home.json';
import ptBRProf   from '@/locales/pt-BR/profile.json';
import ptBRNotif  from '@/locales/pt-BR/notifications.json';
import ptBRTitle  from '@/locales/pt-BR/title.json';
import ptBRSet    from '@/locales/pt-BR/settings.json';
import ptBRErr    from '@/locales/pt-BR/errors.json';

// ── en-US (full) ─────────────────────────────────────────────
import enUSNav    from '@/locales/en-US/navigation.json';
import enUSCommon from '@/locales/en-US/common.json';
import enUSAuth   from '@/locales/en-US/auth.json';
import enUSHome   from '@/locales/en-US/home.json';
import enUSProf   from '@/locales/en-US/profile.json';
import enUSNotif  from '@/locales/en-US/notifications.json';
import enUSTitle  from '@/locales/en-US/title.json';
import enUSSet    from '@/locales/en-US/settings.json';
import enUSErr    from '@/locales/en-US/errors.json';

// ── es-ES (full) ─────────────────────────────────────────────
import esESNav    from '@/locales/es-ES/navigation.json';
import esESCommon from '@/locales/es-ES/common.json';
import esESAuth   from '@/locales/es-ES/auth.json';
import esESHome   from '@/locales/es-ES/home.json';
import esESProf   from '@/locales/es-ES/profile.json';
import esESNotif  from '@/locales/es-ES/notifications.json';
import esESTitle  from '@/locales/es-ES/title.json';
import esESSet    from '@/locales/es-ES/settings.json';
import esESErr    from '@/locales/es-ES/errors.json';

// ── other locales (navigation + common only) ──────────────────
import esMXNav    from '@/locales/es-MX/navigation.json';
import esMXCommon from '@/locales/es-MX/common.json';
import ptPTNav    from '@/locales/pt-PT/navigation.json';
import ptPTCommon from '@/locales/pt-PT/common.json';
import frFRNav    from '@/locales/fr-FR/navigation.json';
import frFRCommon from '@/locales/fr-FR/common.json';
import deDENav    from '@/locales/de-DE/navigation.json';
import deDECommon from '@/locales/de-DE/common.json';
import itITNav    from '@/locales/it-IT/navigation.json';
import itITCommon from '@/locales/it-IT/common.json';
import jaJPNav    from '@/locales/ja-JP/navigation.json';
import jaJPCommon from '@/locales/ja-JP/common.json';
import koKRNav    from '@/locales/ko-KR/navigation.json';
import koKRCommon from '@/locales/ko-KR/common.json';
import enGBNav    from '@/locales/en-GB/navigation.json';
import enGBCommon from '@/locales/en-GB/common.json';

const NAMESPACES = ['common', 'navigation', 'auth', 'home', 'profile', 'notifications', 'title', 'settings', 'errors'] as const;

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources: {
      'pt-BR': {
        navigation: ptBRNav, common: ptBRCommon, auth: ptBRAuth,
        home: ptBRHome, profile: ptBRProf, notifications: ptBRNotif,
        title: ptBRTitle, settings: ptBRSet, errors: ptBRErr,
      },
      'en-US': {
        navigation: enUSNav, common: enUSCommon, auth: enUSAuth,
        home: enUSHome, profile: enUSProf, notifications: enUSNotif,
        title: enUSTitle, settings: enUSSet, errors: enUSErr,
      },
      'es-ES': {
        navigation: esESNav, common: esESCommon, auth: esESAuth,
        home: esESHome, profile: esESProf, notifications: esESNotif,
        title: esESTitle, settings: esESSet, errors: esESErr,
      },
      'es-MX': { navigation: esMXNav, common: esMXCommon },
      'pt-PT': { navigation: ptPTNav, common: ptPTCommon },
      'fr-FR': { navigation: frFRNav, common: frFRCommon },
      'de-DE': { navigation: deDENav, common: deDECommon },
      'it-IT': { navigation: itITNav, common: itITCommon },
      'ja-JP': { navigation: jaJPNav, common: jaJPCommon },
      'ko-KR': { navigation: koKRNav, common: koKRCommon },
      'en-GB': { navigation: enGBNav, common: enGBCommon },
    },
    lng: 'pt-BR',
    fallbackLng: {
      'pt-PT': ['pt-BR'],
      'es-MX': ['es-ES', 'en-US', 'pt-BR'],
      'es-ES': ['en-US', 'pt-BR'],
      'fr-FR': ['en-US', 'pt-BR'],
      'de-DE': ['en-US', 'pt-BR'],
      'it-IT': ['en-US', 'pt-BR'],
      'ja-JP': ['en-US', 'pt-BR'],
      'ko-KR': ['en-US', 'pt-BR'],
      'en-GB': ['en-US', 'pt-BR'],
      default:  ['en-US', 'pt-BR'],
    },
    ns: NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18next;
export { NAMESPACES };
