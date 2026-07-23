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

O painel fica em `apps/admin`, é publicado como um segundo projeto Vercel e
consome diretamente a URL HTTPS da Cloud Function `centralApi`. Ele contém somente o Firebase Client SDK.
O Admin SDK fica em Cloud Functions, scripts locais controlados e rotas Next
exclusivamente server-side.

1. Use Application Default Credentials para o bootstrap local; evite baixar
   JSON de service account.
2. Execute `npm run admin:bootstrap -- --email usuario@dominio.com` e confirme
   interativamente o primeiro `super_admin`.
3. Configure Firebase Auth/RBAC e as variáveis do backend conforme `docs/`.
   Cloudflare Access é uma camada futura opcional (`disabled|monitor|required`).
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

O app possui rotas dinâmicas e APIs do Next.js. Por isso, o contêiner nativo
carrega a aplicação hospedada, enquanto os plugins (push, câmera etc.) são
executados pelo Capacitor.

```bash
npm run cap:sync      # sincroniza plugins e assets
npm run cap:android   # abre no Android Studio → Run
npm run cap:ios       # abre no Xcode → Run (só Mac)
```

Para testar o servidor local no simulador:

```bash
npm run cap:sync:local
```

### 3.3 Preparar os projetos nativos para produção

```bash
npm run build:mobile  # sincroniza o contêiner com https://maratonou.com
npm run cap:android   # Android Studio → Build → Generate Signed Bundle
# iOS: Xcode → Product → Archive → Distribute App
```

Antes de arquivar para as lojas, confirme que `maratonou.com` está com o deploy
correto e que os recursos nativos exigidos pela versão estão configurados.

### 3.4 Push Notifications no mobile

O identificador definitivo nas duas lojas é `com.maratonou.app`. O código usa
Firebase Messaging nativo, que grava um token FCM tanto no Android quanto no
iPhone e mantém o mesmo envio server-side já usado pela PWA.

**Android — registrar o app Firebase:**
1. Firebase Console → **Configurações do projeto** → **Geral** → **Adicionar app** → Android.
2. Informe exatamente `com.maratonou.app` como nome do pacote.
3. Obtenha o SHA-1 de desenvolvimento com `cd android && ./gradlew signingReport`
   e cadastre-o no app Android do Firebase. O SHA da chave de produção deve ser
   adicionado depois que a Play Console criar/confirmar o App Signing.
4. Baixe `google-services.json` e salve em `android/app/google-services.json`.
5. Firebase → **Authentication** → **Método de login** → ative Google.

**iOS — registrar o app Firebase:**
1. Firebase Console → **Configurações do projeto** → **Geral** → **Adicionar app** → iOS.
2. Informe exatamente `com.maratonou.app` como Bundle ID.
3. Baixe `GoogleService-Info.plist`, salve em `ios/App/App/` e, no Xcode,
   arraste-o para o grupo **App** marcando **Copy items if needed** e o target **App**.
4. Copie o valor `REVERSED_CLIENT_ID` do plist e adicione-o no Xcode em
   **Target App → Info → URL Types → URL Schemes**. Isso conclui o retorno do
   login Google ao aplicativo.
5. Firebase → **Authentication** → **Método de login** → ative Google e Apple.

**Apple Developer, assinatura e APNs:**
1. Apple Developer → **Identifiers** → App IDs → crie/abra `com.maratonou.app`
   e ative **Push Notifications** e **Sign in with Apple**.
2. Apple Developer → **Keys** → crie uma chave com APNs, baixe o `.p8` uma única
   vez e guarde também o Key ID e Team ID.
3. Firebase → **Configurações do projeto** → **Cloud Messaging** → app iOS →
   envie a chave APNs (`.p8`, Key ID e Team ID).
4. No Xcode, abra **Target App → Signing & Capabilities**, selecione sua Team e
   confirme as capabilities **Push Notifications** e **Sign in with Apple**.
   O projeto já contém os entitlements correspondentes.
5. **Background Modes → Remote notifications** só é necessário se o app passar
   a processar notificações silenciosas em segundo plano; os alertas comuns não
   dependem disso.

Depois de adicionar os dois arquivos Firebase, execute `npm run cap:sync` e
teste login/push em aparelhos reais. APNs não deve ser validado apenas no
simulador.

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
