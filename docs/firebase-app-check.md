# Firebase App Check

O código Web/PWA e o painel já inicializam `ReCaptchaEnterpriseProvider` quando a flag explícita está ativa. A API verifica `X-Firebase-AppCheck` manualmente, pois é um backend HTTP próprio. O padrão do backend é `monitor`; `required` rejeita token ausente/inválido.

O App Check complementa Authentication, Cloudflare Access e RBAC. Ele não substitui nenhum deles. Provedores oficiais recomendados pelo Firebase: reCAPTCHA Enterprise na Web, App Attest/DeviceCheck em Apple e Play Integrity no Android. Veja [Firebase App Check](https://firebase.google.com/docs/app-check) e [reCAPTCHA Enterprise para Web](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider?hl=pt-br).

## Ativação segura

1. Registre separadamente o site/PWA e o painel no console.
2. Crie as chaves reCAPTCHA Enterprise com domínios de produção e homologação.
3. Preencha as variáveis públicas e ative `NEXT_PUBLIC_APPCHECK_ENABLED=true`/`VITE_APPCHECK_ENABLED=true` somente no ambiente correto.
4. Para desenvolvimento, gere debug token no console e use apenas variáveis locais ignoradas pelo Git.
5. Mantenha `APP_CHECK_ENFORCEMENT=monitor`; acompanhe ausentes/inválidos nos logs e métricas.
6. Registre o app iOS com App Attest e fallback DeviceCheck. Este repositório usa Capacitor e ainda precisa da configuração nativa no Xcode/Firebase.
7. Quando o Android for adicionado, registre assinatura/SHA e Play Integrity. Hoje não existe pasta Android no repositório.
8. Só depois de validar produção, previews e mobile altere o backend para `required` e habilite enforcement dos produtos no console.

Rollback emergencial: volte a variável do backend para `monitor` e desative enforcement do produto no console; não remova Auth/RBAC.
