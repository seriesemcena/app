# Deploy do painel na Vercel e da API no Firebase

## Topologia adotada

- App público: projeto Vercel existente em `maratonou.com`.
- Painel: segundo projeto Vercel, com raiz `apps/admin`, em `admin.maratonou.com`.
- API: URL HTTPS própria da Cloud Function `centralApi`.
- DNS: continua na Hostinger; apenas o CNAME de `admin` é adicionado.
- Cloudflare Access e Firebase Hosting: opcionais, fora do primeiro deploy.

## Dependência de Blaze

Cloud Functions exige o plano Blaze. O código está preparado e testável em Emulator, mas nenhum billing é alterado automaticamente. Antes do deploy, crie alerta de orçamento (alertas não bloqueiam cobranças), revise logs/cotas e confirme a região. A API não possui `minInstances`; usa 256 MiB, 60 s e no máximo 10 instâncias.

## Backend Firebase

1. Crie `functions/.env.<PROJECT_ID>` (ignorado pelo Git):

```env
ADMIN_ALLOWED_ORIGINS=https://admin.maratonou.com
CLOUDFLARE_ACCESS_ENFORCEMENT=disabled
CLOUDFLARE_ACCESS_TEAM_DOMAIN=
CLOUDFLARE_ACCESS_AUDIENCE=
APP_CHECK_ENFORCEMENT=monitor
ADMIN_EMULATOR_BYPASS=false
```

2. Cadastre o segredo de auditoria sem colocá-lo em arquivo:

```bash
firebase functions:secrets:set AUDIT_IP_HASH_SECRET --project <PROJECT_ID>
```

3. Após os testes, publique somente Rules, índices e a API:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project <PROJECT_ID>
firebase deploy --only functions:centralApi --project <PROJECT_ID>
```

O CLI exibirá a URL da Function, normalmente no formato `https://us-central1-<PROJECT_ID>.cloudfunctions.net/centralApi`. Use a URL exata fornecida pelo CLI. `firebase.api.json` e `api-hosting/` permanecem apenas como opção futura para um domínio dedicado; não fazem parte desse deploy.

## Painel Vercel

Crie outro projeto com o mesmo repositório:

- Root Directory: deixe vazio para usar a raiz do repositório.
- Framework Preset: Vite.
- Install Command: `npm install`.
- Build Command: `npm run admin:build`.
- Output Directory: `apps/admin/dist`.

O build parte da raiz porque o painel consome o pacote compartilhado
`packages/api-client` pelo workspace do monorepo.

Variáveis de produção: copie os nomes de `apps/admin/.env.example`, usando em `VITE_ADMIN_API_URL` a URL real da Function. Não coloque Admin SDK, service account, TMDB ou segredos em variáveis `VITE_*`.

Adicione `admin.maratonou.com` ao projeto. Se o domínio usa DNS da Vercel, o subdomínio é configurado automaticamente; em outro provedor, crie apenas o CNAME exato informado pela Vercel. Adicione também `admin.maratonou.com` aos domínios autorizados do Firebase Authentication.

## Evolução opcional

Quando Cloudflare Access for adotado, primeiro use `monitor`, configure Team Domain/AUD e observe logs; depois mude para `required`. Nesse momento, `api.maratonou.com` e Firebase Hosting poderão ser avaliados, mas não são pré-requisitos para a primeira versão.

Storage continua fora do deploy. Quando houver necessidade e autorização de billing, revisar e publicar separadamente com `firebase.storage.json`.

## Rollback

- Function: reverta o commit e publique a versão anterior; em emergência, desative `adminUsers` afetados.
- Painel: restaure o deploy anterior na Vercel.
- Rules: publique o arquivo anterior conhecido; nunca use regra aberta como correção temporária.
- Preserve `auditLogs` durante qualquer incidente.

## Dependências e auditoria

Na auditoria desta etapa, `npm audit --omit=dev` não apontou vulnerabilidades altas ou críticas, mas reportou dependências transitivas moderadas. Não use `npm audit fix --force` sem uma etapa própria de atualização e regressão.
