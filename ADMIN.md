# Administração do Maratonou

O painel não faz mais parte do bundle público. A aplicação independente está em `apps/admin`, a rota Next `/admin` apenas redireciona para `admin.maratonou.com` e a API privilegiada está em `functions/admin-api.js`.

Documentação principal:

- [arquitetura e RBAC](docs/admin-architecture.md)
- [bootstrap do primeiro super_admin](docs/firebase-admin-bootstrap.md)
- [Cloudflare Pages e Zero Trust](docs/cloudflare-zero-trust.md)
- [App Check](docs/firebase-app-check.md)
- [ambientes e Emulator](docs/environment-setup.md)
- [deploy da API e Blaze](docs/api-deployment.md)
- [resposta a incidentes](docs/incident-response.md)

Verificação local:

```bash
npm run admin:build
npm run test:security
npm run test:rules
```

Cloud Functions e Storage não devem ser publicados antes da autorização para ativar Blaze. Nenhum deploy, DNS ou configuração externa é executado automaticamente.
