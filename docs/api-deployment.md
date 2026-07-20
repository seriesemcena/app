# Deploy da API e `api.maratonou.com`

## Dependência de Blaze

Cloud Functions exige o plano Blaze. O código está preparado e testável em Emulator, mas **não foi publicado** e nenhum billing foi alterado. A documentação oficial confirma que Blaze vincula uma conta de faturamento e dá acesso a Functions: [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Antes do deploy, crie alerta de orçamento (alertas não bloqueiam cobranças), limite permissões da service account de runtime, revise logs/cotas e confirme a região do Firestore. O arquivo atual usa a região padrão histórica `us-central1`; altere Function e rewrite juntos se o banco estiver em outra região. Não há `minInstances`; a API usa 256 MiB, 60 s e no máximo 10 instâncias.

## Configuração

1. Crie projetos Firebase separados para staging e produção; copie `.firebaserc.example` sem versionar IDs indevidos.
2. Configure `ADMIN_ALLOWED_ORIGINS`, Team Domain, Access AUD e modo App Check por ambiente.
3. Guarde `AUDIT_IP_HASH_SECRET`, TMDB e demais credenciais no Secret Manager/ambiente seguro; nunca use prefixo público.
4. Publique as Firestore Rules e índices após executar testes.
5. Ative Blaze e alertas somente com autorização do proprietário.
6. Revise o diff e então, com autorização explícita:

```bash
firebase use production
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions,hosting --config firebase.api.json
```

O Hosting rewrite versionado encaminha `/v1/**` para `centralApi`; a abordagem segue a documentação oficial de [Hosting + Functions](https://firebase.google.com/docs/hosting/functions). Conecte `api.maratonou.com` ao site Firebase Hosting, aguarde SSL e só depois atualize `VITE_ADMIN_API_URL`.

Storage continua fora desse deploy. Quando houver necessidade/Blaze, revisar e publicar separadamente com `firebase.storage.json`.

## Dependências e auditoria

Na auditoria realizada durante esta etapa, `npm audit --omit=dev` não apontou vulnerabilidades altas ou críticas, mas reportou dependências transitivas com severidade moderada. Não foi usado `npm audit fix --force`, pois as correções sugeridas envolvem mudanças potencialmente incompatíveis em Next.js/Firebase. Reavalie os avisos e faça a atualização em uma etapa dedicada, com testes de regressão, antes do deploy.

## Rollback

- Function: reverta o commit e publique a versão anterior; em emergência, bloqueie a política Access e origens.
- Hosting: restaure release anterior no console.
- Rules: publique o arquivo anterior conhecido; nunca use regra aberta como correção temporária.
- Desative administradores afetados e preserve `auditLogs`.
