# Maratonou — Prontidão para App Store e Google Play

> Documento de preparação de release. **Não contém segredos.**
> Última atualização: 23/07/2026 · App: `com.maratonou.app` · Nome: **Maratonou**
> Produção web: https://maratonou.com

---

## 1. Status geral

O app é um shell **Capacitor 8.3.1** que carrega a produção remota
(`server.url = https://maratonou.com`), com `native-shell/` como fallback local.
Integrações nativas reais já presentes: **push (FCM)**, **login social nativo**
(Google/Apple via provider UI) e um **plugin Swift próprio** (SFSymbols).

- **Versão alvo:** 1.0.0 · iOS build 1 · Android versionCode 1 — **normalizado**.
- **Estado:** pré-release candidate. Faltam ações manuais de assinatura, valores
  de associação (Team ID / SHA-256) e cadastro nas lojas.
- **Nenhum envio para revisão foi feito.**

---

## 2. Bloqueadores (impedem submissão)

| # | Bloqueador | Resolvido nesta rodada? |
|---|---|---|
| B1 | Política de Privacidade pública | ✅ `/legal/privacy` |
| B2 | Termos de Uso públicos | ✅ `/legal/terms` |
| B3 | Página pública de exclusão de dados (exigida pelo Google Play) | ✅ `/legal/delete-account` |
| B4 | `PrivacyInfo.xcprivacy` (Apple, obrigatório) | 🟡 arquivo criado — **falta adicionar ao target no Xcode** |
| B5 | Deep links (AASA + assetlinks + capabilities) | 🟡 arquivos e config prontos — **faltam Team ID, SHA-256 e publicação em produção** |
| B6 | Ícone de push Android ausente | ✅ criado `ic_stat_icon_config_sample` + meta-data FCM |
| B7 | APNs em `development` nas entitlements | ✅ **resolvido** — entitlements por configuração (Debug=development, Release=production) |
| B8 | Assinatura iOS/Android (Team, keystore) | 🔴 **ação manual do usuário** |
| B9 | Risco de rejeição por "wrapper" (Apple 4.2) | 🟡 mitigado; ver §17 |
| B10 | UGC sem "bloquear usuário" (Apple 1.2) | ✅ **resolvido** — bloqueio no perfil + conteúdo oculto no feed/comentários |

---

## 3. Itens prontos (implementados e validados nesta rodada)

- **Versão 1.0.0** — iOS (`MARKETING_VERSION`) e Android (`versionName`).
- **Arquivos de associação** em `public/.well-known/`:
  - `apple-app-site-association` (servido como `application/json` via `next.config.mjs`).
  - `assetlinks.json`.
- **iOS Associated Domains** nas entitlements: `applinks:maratonou.com`, `webcredentials:maratonou.com`.
- **Android App Links + esquema próprio** no `AndroidManifest.xml`:
  intent-filter `autoVerify` para `https://maratonou.com` (+ `www`) e `maratonou://`.
- **Ícone de push Android** monocromático + `default_notification_icon`/`_color` (FCM).
- **`PrivacyInfo.xcprivacy`** criado (required-reason APIs + tipos de dados coletados).
- **Páginas legais** públicas e estáticas (`/legal/*`), linkadas em Configurações.
- **APNs por configuração** — `App.entitlements` (development) para Debug,
  `AppRelease.entitlements` (production) para Release, via `CODE_SIGN_ENTITLEMENTS`
  específico do bloco Release no `project.pbxproj`.
- **Bloquear usuário** — menu no perfil (Denunciar + Bloquear/Desbloquear);
  bloquear implica deixar de seguir; conteúdo do bloqueado fica oculto no feed e
  nos comentários. `blocked_list` no doc próprio (Firestore) + cache `sec_blocked`
  uid-scoped. Coberto por `tests/block-users.test.mjs`.
- **Traduções** `privacy`/`terms` (settings) e `blockUser`/`unblockUser`/`reportProfile`
  (profile) em pt-BR, en-US, es-ES.

Validação executada: `tsc` limpo · `npm test` 80/80 · `git diff --check` OK ·
`npm run build` OK (rotas `/legal/*` estáticas) · `npx cap sync` OK com
`server.url` preservado nos dois nativos.

---

## 4. Ações manuais do usuário (fora do alcance do código)

1. **Xcode → adicionar `PrivacyInfo.xcprivacy` ao target App** (arrastar o arquivo
   `ios/App/App/PrivacyInfo.xcprivacy` para o projeto, marcar target "App"). Sem isso
   ele não entra no bundle. *(pbxproj não foi editado à mão de propósito — risco.)*
2. **Team ID Apple** → substituir `REPLACE_WITH_APPLE_TEAM_ID` em
   `public/.well-known/apple-app-site-association` (10 caracteres, ex.: `A1B2C3D4E5`).
3. **SHA-256** → substituir os dois placeholders em
   `public/.well-known/assetlinks.json`:
   - `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` (do Play Console → App Integrity → App signing).
   - `REPLACE_WITH_UPLOAD_KEY_SHA256` (da sua upload key).
4. **Publicar** os dois arquivos em produção (deploy do web) e confirmar:
   - `https://maratonou.com/.well-known/apple-app-site-association` → `Content-Type: application/json`.
   - `https://maratonou.com/.well-known/assetlinks.json` → 200.
5. **Xcode → Signing & Capabilities:** selecionar Team, manter "Automatically manage
   signing", confirmar capabilities: Push Notifications, Sign in with Apple,
   Associated Domains (já nas entitlements).
6. **Firebase Console:** subir a **APNs Auth Key (.p8)** para push iOS funcionar.
7. **Android keystore de upload** — ver §11 (gerar você mesmo, nunca versionar).
8. Confirmar **e-mail de suporte** `suporte@maratonou.com` existe (usado nas páginas
   legais) ou trocar pelo endereço correto.

---

## 5. Checklist iOS

- [x] Bundle Identifier `com.maratonou.app`
- [x] `GoogleService-Info.plist` no target (4 refs no pbxproj)
- [x] URL scheme do Google Login (REVERSED_CLIENT_ID no Info.plist)
- [x] Sign in with Apple (entitlements)
- [x] Associated Domains (entitlements)
- [x] Handlers de push e Universal Links no AppDelegate
- [x] Versão 1.0.0 / build 1
- [ ] `PrivacyInfo.xcprivacy` adicionado ao target *(manual)*
- [ ] Team selecionado / assinatura *(manual)*
- [ ] APNs .p8 no Firebase *(manual)*
- [x] `aps-environment` = `production` no Release (`AppRelease.entitlements`)
- [ ] Ícone 1024×1024 **sem alpha** — confirmar `AppIcon-512@2x.png`
- [ ] Testes em device físico *(manual)*

## 6. Checklist Android

- [x] `applicationId` `com.maratonou.app`
- [x] `google-services.json` presente + plugin aplicado
- [x] compileSdk/targetSdk 36, minSdk 24
- [x] `versionCode 1` / `versionName 1.0.0`
- [x] `POST_NOTIFICATIONS` (via manifest do plugin messaging)
- [x] Ícone de push + cor de acento
- [x] Intent-filters App Links + `maratonou://`
- [x] `release` sem `debuggable`; minify desligado (seguro)
- [ ] Keystore de upload gerado *(manual — §11)*
- [ ] SHA-256 no assetlinks + Firebase *(manual)*
- [ ] Adaptive icon final revisado
- [ ] Testes em device físico *(manual)*

## 7. Checklist App Store Connect (cadastro manual)

Nome · Subtítulo · Descrição · Palavras-chave · Categoria · Classificação etária ·
Copyright · **Support URL** (`https://community.maratonou.com`) ·
**Privacy Policy URL** (`https://maratonou.com/legal/privacy`) · Screenshots ·
Contato · **Conta de demonstração** (login de teste) · Notas ao revisor ·
Declaração de criptografia (uso de HTTPS/padrão — normalmente isento) ·
**App Privacy** (ver §9) · Conteúdo gerado por usuários + moderação (ver §18) ·
Exclusão de conta no app (existe: Configurações → Excluir conta) · Escolha do build ·
TestFlight antes da revisão.

## 8. Checklist Play Console (cadastro manual)

Nome · Descrição curta e completa · Categoria · Ícone · Feature graphic ·
Screenshots · **Política de privacidade** (`https://maratonou.com/legal/privacy`) ·
**Data Safety** (ver §9) · Classificação de conteúdo · Público-alvo · Anúncios (não) ·
**App Access** (conta de demonstração) · **Exclusão de conta no app** + **URL externa**
(`https://maratonou.com/legal/delete-account`) · Declaração de permissões
(`INTERNET`, `POST_NOTIFICATIONS`) · Play App Signing · Internal → Closed → Production.

> ⚠️ **Conta pessoal nova no Google Play:** exige **teste fechado com no mínimo 12
> testers por 14 dias contínuos** antes de poder solicitar acesso à produção.
> Planejar isso desde já.

## 9. Privacidade e Data Safety

Dados coletados (declarar iguais nas duas lojas e no `PrivacyInfo.xcprivacy`):

| Dado | Uso | Vinculado ao usuário | Rastreamento |
|---|---|---|---|
| E-mail | Conta/login | Sim | Não |
| ID de usuário | Conta/perfil | Sim | Não |
| Conteúdo do usuário (comentários, imagens, listas) | Funcionalidade | Sim | Não |
| Token de push (FCM) | Notificações | Sim | Não |

Terceiros: Firebase (Google), TMDB, Giphy, Apple/Google (login). **Sem rastreamento
publicitário.** Sem anúncios. Retenção enquanto a conta existir; exclusão via app ou §6.

## 10. Plano de testes (executar em device físico — manual)

Login e-mail/Google/Apple · logout · exclusão de conta · push nos 3 estados
(aberto/2º plano/encerrado) · tap no push abre destino · inbox atualiza ·
deep links (`https://maratonou.com/title/...` e `maratonou://`) · teclado ·
safe areas · Giphy · comentários · upload de imagem · navegação de retorno ·
instalação limpa.

## 11. Processo de versionamento

- **iOS:** `MARKETING_VERSION` (1.0.0) + `CURRENT_PROJECT_VERSION` (build, incrementar
  a cada upload TestFlight).
- **Android:** `versionName` (1.0.0) + `versionCode` (inteiro, +1 a cada AAB).
- Manter os dois em sincronia a cada release.

## 12. Geração do Archive (iOS) — manual

1. `npm run cap:sync` (mantém `server.url` de produção — **sempre** use este script).
2. `npm run cap:ios` (abre o Xcode).
3. Selecionar device "Any iOS Device".
4. Product → Archive → Validate App → Distribute (TestFlight). **Sem upload sem sua ordem.**

## 13. Geração do AAB (Android) — manual

1. `npm run cap:sync`.
2. `npm run cap:android` (abre o Android Studio) **ou** via Gradle.
3. Build → Generate Signed Bundle → Android App Bundle → keystore de upload.
4. Artefato AAB para o Play Console. **Sem upload sem sua ordem.**

### Keystore de upload (gerar você, nunca versionar)
```
keytool -genkey -v -keystore maratonou-upload.jks -alias maratonou \
  -keyalg RSA -keysize 2048 -validity 10000
```
- Guardar o `.jks` e as senhas **fora do repositório** (já ignorado no gitignore).
- Ativar **Play App Signing** (o Google guarda a chave de app; você usa a upload key).
- SHA-256 da upload key + da app signing → cadastrar no Firebase e no `assetlinks.json`.

## 14. Caminhos dos artefatos

- iOS Archive: `~/Library/Developer/Xcode/Archives/…` (gerado pelo Xcode).
- Android AAB: `android/app/build/outputs/bundle/release/app-release.aab`.
- Android APK (debug, teste): `android/app/build/outputs/apk/debug/app-debug.apk`.
- Web `.well-known/`: `public/.well-known/` → servido em `https://maratonou.com/.well-known/`.

## 15. Plano de rollback

- **Web:** o `.well-known` e as páginas `/legal/*` são aditivos; reverter = deploy do
  commit anterior na Vercel (sem efeito colateral em dados).
- **Nativo:** as mudanças estão em arquivos versionados; `git revert` do commit desta
  rodada desfaz tudo sem tocar em assinatura/keystore.
- **Lojas:** builds só sobem manualmente; nenhum rollback de loja necessário nesta fase.

## 16. Itens que exigem sua decisão

- **PRO / pagamentos:** decisão registrada — **não mexer agora** (lançar sem venda
  in-app; billing fica para depois). Enquanto não houver venda digital no app, não há
  obrigação de StoreKit/Play Billing.
- **Curadoria por IA:** permanece desativada e bloqueada.
- Confirmar e-mail de suporte e textos legais (revisão jurídica é sua alçada).

## 17. Qualidade do wrapper (mitigação Apple 4.2 / "minimum functionality")

**Presente:** push nativo, login social nativo, safe areas, plugin Swift próprio,
ícones/splash nativos, service worker com offline/cache, deep links configurados.
**Recomendações futuras (não bloqueiam RC):** compartilhamento nativo (`@capacitor/share`),
haptics, e garantir que o app **não** apenas espelhe o site — os recursos nativos acima
já ajudam. Screenshots devem mostrar funcionalidades de app, não "um site".

## 18. Conteúdo gerado por usuários (risco de rejeição)

**Implementado no app:** denunciar comentários e perfis, **bloquear usuário**
(menu no perfil; conteúdo do bloqueado oculto no feed e comentários; bloquear
também deixa de seguir), excluir o próprio conteúdo, moderação administrativa,
Termos com política anti-abuso. Isso cobre os quatro pilares de UGC da guideline 1.2
da Apple (filtrar, denunciar, bloquear, contato). **Recomendação restante:** definir
um SLA de resposta a denúncias (ex.: 24h) — operacional, não bloqueia código.

---

### Legenda de status no relatório
✅ implementado e validado · 🟡 pronto no código, depende de valor/ação manual ·
🔴 depende exclusivamente de ação manual sua · ⏳ depende de aprovação Apple/Google.
