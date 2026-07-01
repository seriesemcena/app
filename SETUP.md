# SEC TIME — Setup Guide

## 1. Firebase

### 1.1 Criar projeto
1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Add project"** → dê o nome `sectime`
3. Ative o **Google Analytics** (opcional mas recomendado)

### 1.2 Configurar Authentication
1. Firebase Console → **Authentication** → Get started
2. **Sign-in method** → habilite:
   - ✅ Email/Password
   - ✅ Google
   - ✅ Apple *(requer Apple Developer account)*

### 1.3 Configurar Firestore
1. Firebase Console → **Firestore Database** → Create database
2. Escolha **Production mode**
3. Selecione a região mais próxima (ex: `southamerica-east1`)
4. Após criar, vá em **Rules** e configure:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Reviews are readable by anyone, writable by logged-in users
    match /reviews/{titleKey} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Config (slider etc.) readable by anyone, writable by admin only
    match /config/{doc} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.email == 'admin@sectime.com'; // change this
    }
  }
}
```

### 1.4 Configurar FCM (Push Notifications)
1. Firebase Console → **Project Settings** → **Cloud Messaging**
2. Em "Web Push certificates" → **Generate key pair**
3. Copie a chave pública (VAPID key) → cole em `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

### 1.5 Copiar credenciais
1. Firebase Console → **Project Settings** → aba **General**
2. Em "Your apps" → clique em **</>** (Web app) → "Register app"
3. Copie o `firebaseConfig` e preencha o `.env.local`:

```bash
cp .env.local.example .env.local
# Edite .env.local com as credenciais copiadas
```

### 1.6 Atualizar firebase-messaging-sw.js
Abra `public/firebase-messaging-sw.js` e substitua os valores `YOUR_*` pelas mesmas credenciais do `.env.local`.  
*(Este arquivo não tem acesso às env vars do Next.js pois é servido como JS puro)*

---

## 2. Deploy (Vercel)

```bash
# Instale a Vercel CLI
npm i -g vercel

# Faça o deploy
vercel

# Adicione as env vars no painel da Vercel:
# vercel.com → Project → Settings → Environment Variables
# (as mesmas do .env.local)
```

---

## 3. Capacitor — Build Mobile

### Pré-requisitos
- **Android**: Android Studio instalado
- **iOS**: Mac com Xcode 15+ e conta Apple Developer ($99/ano)

### 3.1 Inicializar plataformas (uma vez)
```bash
npm run cap:init
# → cria as pastas android/ e ios/
```

### 3.2 Build de desenvolvimento (live reload)

O app no celular carrega o site do Vercel diretamente.  
Edite `capacitor.config.ts` e coloque a URL do Vercel em `server.url`.

```bash
npm run cap:sync      # sincroniza plugins e assets
npm run cap:android   # abre no Android Studio → Run
npm run cap:ios       # abre no Xcode → Run (só Mac)
```

### 3.3 Build de produção (bundle estático)

```bash
npm run build:mobile  # gera /out + copia para Capacitor
npm run cap:android   # Android Studio → Build → Generate Signed Bundle
# iOS: Xcode → Product → Archive → Distribute App
```

### 3.4 Push Notifications no mobile

**Android (FCM):**
1. Firebase Console → **Project Settings** → **Cloud Messaging**
2. Em "Android apps" → baixe o `google-services.json`
3. Mova para `android/app/google-services.json`

**iOS (APNs via FCM):**
1. Apple Developer Portal → **Certificates** → **Keys** → gerar chave APNs
2. Firebase Console → **Project Settings** → **Cloud Messaging** → iOS app → upload da chave APNs
3. No Xcode → **Signing & Capabilities** → adicionar **Push Notifications** + **Background Modes** (Remote notifications)

---

## 4. Cloud Functions (notificações automáticas server-side)

Para notificações de lançamentos que dispararem mesmo com o app fechado:

```bash
# Na raiz do projeto
firebase init functions
# Escolha TypeScript
```

Adicione em `functions/src/index.ts`:

```ts
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();
const db = admin.firestore();

// Roda todo dia às 9h (horário de Brasília = UTC-3)
export const checkReleases = onSchedule('0 12 * * *', async () => {
  // Busca todos os usuários com fcm_tokens
  const users = await db.collection('users').listDocuments();
  for (const userDoc of users) {
    const data = (await userDoc.get()).data();
    const tokens: string[] = data?.fcm_tokens ?? [];
    const lists: any[]     = [
      ...(data?.lists_want     ?? []),
      ...(data?.lists_watching ?? []),
    ];
    for (const item of lists) {
      // Buscar TMDB para datas (use fetch com TMDB_API_KEY)
      // Se release em ≤3 dias → enviar FCM para tokens do usuário
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `🎬 Estreia próxima: ${item.title}`,
          body:  `Lançamento em X dias`,
        },
      });
    }
  }
});
```

```bash
firebase deploy --only functions
```
