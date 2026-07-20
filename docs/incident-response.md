# Resposta a incidentes administrativos

## Conta administrativa comprometida

1. Bloqueie temporariamente o painel e a API administrativa no Cloudflare Access.
2. Marque `adminUsers/{uid}.status=inactive` usando um operador seguro/Admin SDK.
3. Remova claims, revogue refresh tokens e desative a conta Firebase se necessário.
4. Consulte `auditLogs` por UID/requestId, preserve evidências e identifique registros afetados.
5. Rotacione credenciais do IdP e reative somente após revisão.

## Segredo ou service account exposta

Revogue/rotacione imediatamente no provedor, remova o material do histórico quando aplicável, audite uso e reduza privilégios. Uma chave pública Firebase não é segredo administrativo, mas Rules/App Check continuam obrigatórios.

## Notificação incorreta

Pause o worker/fila, impeça novos jobs `pending`, preserve o job e auditoria, comunique a correção. FCM não garante “recall” do que já foi entregue.

## Promoção indevida

Inative `adminUsers`, remova claims, revogue sessões, compare `authVersion`, revise quem executou a ação e confirme que ainda existe `super_admin` legítimo.

## Rules incorretas

Bloqueie escrita sensível, publique a última versão testada e valide no Emulator. Nunca publique `allow read, write: if true` como fallback.

## Abuso/cobrança inesperada

Restrinja origens/Access, reduza `maxInstances` ou desabilite temporariamente a função, revise rate-limit/logs/cotas e billing. Alertas de orçamento informam; não são teto de cobrança.
