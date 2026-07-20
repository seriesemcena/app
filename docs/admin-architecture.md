# Arquitetura administrativa do Maratonou

## Fluxo implementado

```text
admin.maratonou.com (projeto Vercel separado)
  -> Firebase Authentication (Client SDK, persistência de sessão do SDK)
  -> URL HTTPS da Cloud Function centralApi
  -> Origin exata + Cloudflare Access opcional + App Check
  -> Firebase ID Token revogado + custom claim
  -> adminUsers/{uid} ativo + role/authVersion
  -> permissão granular + validação + rate limit
  -> Admin SDK -> Firebase
  -> auditLogs
```

O painel está em `apps/admin`, possui build próprio e não importa o Admin SDK. O site antigo apenas redireciona `/admin`; `/api/admin/*` retorna `410 Gone`. A API versionada está em `functions/admin-api.js`.

## Autoridade

São sempre exigidas simultaneamente:

1. claim `{ admin: true, role, authVersion }` emitida pelo Admin SDK;
2. `adminUsers/{uid}` com `status: active`;
3. mesmo `role` e `authVersion` da claim;
4. permissão da ação.

Cloudflare Access é defesa adicional configurável por `CLOUDFLARE_ACCESS_ENFORCEMENT`. O padrão de segurança é `required` quando a variável está ausente; a implantação inicial na Vercel usa explicitamente `disabled`, sem remover nenhuma das verificações Firebase/RBAC acima. `monitor` valida quando houver token e registra ausências ou erros sem bloquear.

Papéis: `super_admin`, `admin`, `moderator`, `editor`, `support`. A matriz completa e testada fica em `functions/admin-security.js`. Permissões extras só aceitam nomes da allowlist e somente a API de superadministrador pode gravá-las.

Alterar/remover um administrador incrementa `authVersion` e revoga refresh tokens. Autoelevação, autoalteração e remoção do último `super_admin` ativo são bloqueadas no servidor.

## Controles comuns

- CORS por allowlist; nunca wildcard nas rotas administrativas.
- Quando ativado, JWT Access RS256 validado por assinatura, `kid`, issuer, audience, `exp` e `nbf`; JWKS com cache de 5 minutos.
- App Check manualmente verificado em modo `monitor` ou `required`.
- ID Token verificado com checagem de revogação.
- Rate limit transacional em `adminRateLimits`.
- Recibos em `adminIdempotency` para operações críticas.
- Confirmação textual e autenticação recente para alto impacto.
- Auditoria sanitizada em `auditLogs`; campos parecidos com segredo são removidos.
- Dashboard usa somente `metrics/global`. Ausência é informada como indisponível, nunca como zero inventado.

## Endpoints implementados

- `GET /v1/public/health`
- `GET /v1/admin/me|dashboard|users|content|comments|reports|notifications|settings|audit-logs|admins`
- `POST /v1/admin/notifications` (rascunho)
- `POST /v1/admin/notifications/:id/send`
- `DELETE /v1/admin/comments/:id`
- `POST|PATCH|DELETE /v1/admin/admins[/:uid]`

Rotas que ainda não possuem uma operação real não simulam sucesso e retornam `404`. O cliente usa respostas padronizadas com `requestId`.

## Coleções internas

`adminUsers`, `auditLogs`, `adminRateLimits` e `adminIdempotency` estão bloqueadas para todos os clientes nas Firestore Rules. Exclusões administrativas também não são concedidas por Rules; passam pelo Admin SDK após o middleware.

Storage continua opt-in enquanto o projeto está no Spark. As regras versionadas já restringem UID, MIME WebP, tamanho e metadado do proprietário, mas não são parte do deploy padrão.
