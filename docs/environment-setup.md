# Ambientes e desenvolvimento

| Ambiente | Site | Painel | API | Firebase |
|---|---|---|---|---|
| Produção | `maratonou.com` | `admin.maratonou.com` | `api.maratonou.com` | projeto exclusivo |
| Homologação | `staging.maratonou.com` | `admin-staging.maratonou.com` | `api-staging.maratonou.com` | projeto exclusivo |
| Desenvolvimento | `127.0.0.1:3000` | `127.0.0.1:4173` | Functions Emulator | `demo-maratonou` |

Não existe evidência de um projeto Firebase de homologação; o arquivo de aliases é apenas modelo. Até criá-lo, use o Emulator e nunca aponte preview para produção.

```bash
cp apps/admin/.env.example apps/admin/.env.local
cp functions/.env.example functions/.env
npm run firebase:emulators
npm run admin:dev
npm run test:security
npm run test:rules
```

O teste de Rules inicia o Firestore Emulator e, por isso, exige um JDK instalado. Antes de executá-lo, confirme `java -version` (JDK 17 ou 21). Neste ambiente de desenvolvimento a suíte ficou configurada, mas não pôde ser executada porque o macOS não possui um runtime Java disponível; os demais testes não dependem de Java.

O bypass do Cloudflare só funciona quando `FUNCTIONS_EMULATOR=true`, `NODE_ENV` não é produção e `ADMIN_EMULATOR_BYPASS=true`. Ele é desligado por padrão e registra alerta. Use contas e dados fictícios no Emulator.

Segredos necessários no backend: TMDB (notificações/conteúdo), opcionalmente Giphy/Gemini conforme rotas existentes, Team Domain/AUD do Access e salt de hash de IP. O frontend administrativo recebe somente configurações públicas Firebase, site key do App Check e URL da API.
