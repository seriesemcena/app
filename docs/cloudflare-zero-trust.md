# Cloudflare Pages e Zero Trust

Nada nesta lista foi executado na conta Cloudflare. É uma checklist manual.

## Cloudflare Pages (`admin.maratonou.com`)

- Diretório raiz do build: raiz do repositório (monorepo)
- Comando de build: `npm ci && npm run admin:build`
- Diretório de saída: `apps/admin/dist`
- Produção: branch principal escolhida pelo proprietário; previews devem usar projeto Firebase e API de homologação.
- Variáveis: copie os nomes de `apps/admin/.env.example`. Não adicione service account, Admin SDK, TMDB, Giphy ou outros segredos.
- Os arquivos `_headers`, `_redirects` e `403.html` são copiados para o build.
- Conecte o domínio `admin.maratonou.com` e valide o certificado antes de liberar acesso.

## Access

Crie duas aplicações/políticas:

1. `https://admin.maratonou.com/*` — somente administradores aprovados.
2. `https://api.maratonou.com/v1/admin/*` — a mesma identidade aprovada. Não cubra `/v1/public/*`.

Use um provedor confiável, sessão curta, reautenticação periódica e MFA resistente a phishing (passkey/chave de segurança). Não use SMS como fator principal. O SSO do mesmo time deve permitir que o cookie HttpOnly de Access autentique a chamada entre os dois subdomínios.

Copie o Team Domain e o AUD da aplicação da API para `CLOUDFLARE_ACCESS_TEAM_DOMAIN` e `CLOUDFLARE_ACCESS_AUDIENCE`. A origem valida `Cf-Access-Jwt-Assertion`, inclusive assinatura — nunca confia em um header de e-mail isolado. Referência oficial: [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Checklist

- [ ] Adicionar `maratonou.com` ao Cloudflare.
- [ ] Criar o projeto Pages e configurar build/saída.
- [ ] Adicionar as variáveis públicas por ambiente.
- [ ] Conectar `admin.maratonou.com`.
- [ ] Criar aplicação Access do painel.
- [ ] Permitir somente e-mails previamente aprovados.
- [ ] Exigir passkey/chave de segurança no IdP.
- [ ] Criar aplicação/política para `api.maratonou.com/v1/admin/*`.
- [ ] Confirmar comportamento de preflight CORS da aplicação da API.
- [ ] Copiar Team Domain e AUD para o backend correto.
- [ ] Testar autorizado, não autorizado, sessão expirada e e-mails divergentes.
- [ ] Confirmar que `/v1/public/health` não exige Access.

Rollback: desative a aplicação Pages ou bloqueie a política Access; não abra a API. Restaure o deploy Pages anterior e mantenha `adminUsers` desativado até encerrar o incidente.
