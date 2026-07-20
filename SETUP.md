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
4. Use `firestore.rules` como fonte de verdade. Não use regras genéricas de
   escrita: elas permitem que uma conta altere dados de outra.
5. Publique regras e índices com `firebase deploy --only firestore` ou copie o
   conteúdo de `firestore.rules` para o console.

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

### 1.6 Configurar a administração separada

O painel fica em `apps/admin`, é publicado separadamente no Cloudflare Pages e
consome `api.maratonou.com/v1/admin/*`. Ele contém somente o Firebase Client SDK.
O Admin SDK fica em Cloud Functions, scripts locais controlados e rotas Next
exclusivamente server-side.

1. Use Application Default Credentials para o bootstrap local; evite baixar
   JSON de service account.
2. Execute `npm run admin:bootstrap -- --email usuario@dominio.com` e confirme
   interativamente o primeiro `super_admin`.
3. Configure Cloudflare Access, App Check e as variáveis do backend conforme
   `docs/`.
4. Não publique Functions/Storage antes de autorizar o plano Blaze.

Consulte `ADMIN.md` e `docs/admin-architecture.md` para o fluxo completo.

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

O worker pronto está em `functions/index.js`. Ele:

- verifica novos episódios a cada seis horas;
- compara mudanças reais em `flatrate` por país antes de anunciar streaming;
- respeita plataformas e preferências de cada usuário;
- grava a caixa `app_notifications` e envia FCM com a mesma mensagem;
- processa envios imediatos/agendados criados pelo painel administrativo;
- usa IDs determinísticos para impedir duplicatas.

Para publicar:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions && npm install && cd ..
firebase functions:secrets:set TMDB_API_KEY
firebase deploy --only firestore,functions
```

O projeto Firebase precisa estar no plano Blaze para Cloud Functions agendadas.
Depois do deploy, abra **Configurações → Preferências de notificações** em
cada dispositivo e ative a permissão de push. Os textos automáticos podem ser
editados em **Admin → Notificações** sem alterar o worker.
