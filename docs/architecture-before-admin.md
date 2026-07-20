# Mapa da arquitetura antes da separação administrativa

Auditoria feita em 20/07/2026, antes das alterações desta etapa.

## Aplicação existente

- Site/PWA: Next.js 16.2.10 (App Router), React 19.2.5 e TypeScript 5.6.
- Mobile: a mesma aplicação exportada pelo Capacitor 8; iOS existe (`com.sectime.app`), Android ainda não foi adicionado ao repositório.
- Firebase Client SDK: 12.12.1; Auth, Firestore, Messaging e Storage opt-in.
- Firebase Admin SDK: usado somente por rotas Next server-side e Functions. O proxy TMDB continua sendo processo de backend.
- Cloud Functions: Node 22/CommonJS, Functions v2; agregados, métricas, ranking, notificações automáticas e fila FCM.
- Deploy público: Next/Vercel preparado; Capacitor para mobile. Não havia configuração versionada de Cloudflare Pages.
- Versões encontradas: web `0.1.0`; iOS `MARKETING_VERSION=1.0`, build `1`. Não existe versão Android no repositório.

## Estado administrativo encontrado

- Painel React dentro de `src/app/admin`, incluído no projeto público.
- API administrativa em `src/app/api/admin/[...segments]`.
- Autorização por lista de e-mails ou `users/{uid}.adminAccess`, sem custom claims obrigatórias e sem `adminUsers`.
- Interface executava operações privilegiadas por API Next, mas clientes comuns também recebiam um atalho de moderação baseado em `NEXT_PUBLIC_ADMIN_EMAILS`.
- Firestore Rules concediam moderação diretamente por e-mail/`adminAccess`.
- Métricas do dashboard vinham de coleções agregadas; não foi mantido nenhum mock.

## Riscos que motivaram a mudança

1. Painel e site compartilhavam build, variáveis e superfície de ataque.
2. E-mail público era tratado como autoridade de moderação.
3. Claims, cadastro administrativo ativo e versão de autorização não eram verificados em conjunto.
4. Não havia validação do JWT do Cloudflare Access, App Check, rate limit distribuído ou idempotência comum.
5. A coleção legada de auditoria não era a fonte canônica pedida para a nova API.

O estado posterior está descrito em [admin-architecture.md](./admin-architecture.md).
