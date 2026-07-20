# Bootstrap e revogação administrativa

O primeiro `super_admin` é criado somente por script local interativo. O script usa Application Default Credentials e não aceita e-mail/UID hardcoded.

```bash
gcloud auth application-default login
export FIREBASE_ADMIN_PROJECT_ID="ID_DO_PROJETO_CORRETO"
npm run admin:bootstrap -- --email usuario@dominio.com
```

Confirme o projeto e digite exatamente `CONCEDER SUPER_ADMIN`. O script se recusa a executar se já existir um `super_admin` ativo, define claim, cria `adminUsers/{uid}`, revoga sessões antigas e grava `auditLogs`.

Não execute no build, CI ou deploy. Não baixe JSON de service account se ADC for suficiente. Caso um JSON seja inevitável, mantenha fora do repositório e aponte `GOOGLE_APPLICATION_CREDENTIALS` localmente.

Para revogar depois do bootstrap, use o painel/API com outro `super_admin`. Em incidente urgente: marque o documento como `inactive`, remova as claims com Admin SDK, revogue refresh tokens e bloqueie o usuário no Auth. O backend consulta o documento em cada operação, portanto a inativação é imediata.
