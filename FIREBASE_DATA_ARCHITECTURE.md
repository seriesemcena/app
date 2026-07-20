# Arquitetura de dados Firebase — Maratonou

## Objetivo e estado de implantação

Este documento descreve a arquitetura otimizada preparada no código. Nenhuma migração de produção foi executada. As novas regras, índices, regras do Storage e Cloud Functions precisam ser validados no Emulator Suite e implantados antes do backfill em um projeto clonado.

Enquanto o projeto permanecer no plano Spark, o Storage fica explicitamente
desativado por `NEXT_PUBLIC_FIREBASE_STORAGE_ENABLED=false`. Os formulários
continuam salvando os demais campos e informam que uploads serão ativados no
futuro, sem tentar acessar um bucket inexistente. O `firebase.json` padrão não
implanta Storage. Após migrar para Blaze, publique as regras com
`firebase deploy --only storage --config firebase.storage.json` e altere a
variável para `true`.

Ordem segura de implantação:

1. criar backup/export do Firestore e do Auth;
2. testar `firestore.rules`, `storage.rules`, índices e Functions no emulador;
3. implantar regras, índices e Functions;
4. executar a migração em `--dry-run` contra um clone;
5. executar `--apply` no clone e validar contagens/amostras;
6. liberar o novo cliente;
7. executar o backfill em produção por tarefas, acompanhando o relatório;
8. manter os campos legados durante uma janela de compatibilidade;
9. remover o modelo legado somente após métricas e amostras confirmarem a equivalência.

## Mapa antes da otimização

```text
users/{uid}
  profile
  counters antigos/parciais
  following_list[]
  lists_want[] / lists_watching[] / lists_watched[] / lists_favorites[]
  ep_watched (mapa crescente)
  imagens base64 dentro do documento

reviews/{titleKey}
  items[]                         <- documento legado grande e concorrente
  items/{reviewId}                <- comentários modernos

activity/{activityId}             <- parte dos campos públicos não duplicada
notifications/{id}
app_notifications/{id}
```

Leituras críticas encontradas na auditoria:

| Fluxo | Antes | Problema |
|---|---:|---|
| Feed | até 60 atividades + leitura da coleção raiz de reviews + consultas de título por card | custo variável e N+1 |
| Ranking | até 500 atividades + até um perfil por usuário | até aproximadamente 1.000 leituras por abertura |
| Estatísticas | até 500 atividades | custo cresce com o uso e resultados incompletos pelo corte |
| Seguidores | uma consulta `array-contains` para cada identidade/alias, até 50 resultados por consulta | duplicidade, limite impreciso e alto custo |
| Comentários/notificações | listas sem cursor consistente ou corte fixo alto | primeiras telas caras e sem paginação real |
| Painel | contagens de coleções, `listUsers(1000)` e listas pré-carregadas de até 500 | custo administrativo proporcional à base |
| Perfil | avatar e capa base64 no documento `users/{uid}` | risco direto do limite de 1 MiB e leituras pesadas |

## Mapa proposto e implementado

```text
users/{uid}
  profile: dados editáveis e URLs do Storage
  counters:
    followersCount, followingCount, commentsCount, ratingsCount,
    listsCount, watchedCount
  following/{targetUid}: dados públicos mínimos do perfil seguido
  followers/{followerUid}: espelho criado por Cloud Function
  private/{...}: tokens e preferências privadas existentes

reviews/{titleKey}/items/{reviewId}
  um documento por comentário/avaliação textual
  authorUid, date, rating, text, replies, likes

ratings/{titleKey}/userRatings/{uid}
  uma nota ativa por usuário e título

ratingSummaries/{titleKey}
  total, sum, average, distribution[1..10]

activity/{activityId}
  uid, authorName, authorUsername, authorAvatarUrl
  titleId, titleKey, titleType, titleName, titleImageUrl
  action, rating, text/media opcionais, createdAt

userStats/{uid}
  recentDays (máximo de 42 dias)
  months (máximo de 12 meses)

rankingMonthly/{YYYY-MM}/entries/{uid}
  dados públicos mínimos, contagens, minutos e score

metrics/global
metricsDaily/{YYYY-MM-DD}
metricsMonthly/{YYYY-MM}
systemEvents/{eventHash}          <- recibos idempotentes com TTL de 30 dias

Firebase Storage
  users/{uid}/avatar/{version}.webp
  users/{uid}/avatar/{version}-thumb.webp
  users/{uid}/cover/{version}.webp
```

### Por que as notas ficam separadas dos comentários

O comentário é histórico e pode haver mais de um por título; a nota ativa é única por usuário e título. O caminho `userRatings` tem nome exclusivo para não colidir com consultas `collectionGroup('items')` usadas pela moderação de comentários.

## Consultas principais

Todas as listas públicas usam página padrão de 20 documentos (`src/lib/dataPolicy.ts`). O cursor é o último `QueryDocumentSnapshot`, aplicado com `startAfter`.

| Tela | Consulta |
|---|---|
| Comentários | `reviews/{titleKey}/items orderBy(date desc) limit(20)` |
| Feed | `activity orderBy(createdAt desc) limit(20)` |
| Atividade do usuário | `activity where(uid == X) orderBy(createdAt desc) limit(20)` |
| Notificações sociais | `notifications where(recipientId == X) orderBy(createdAt desc) limit(20)` |
| Notificações do app | `app_notifications where(recipientId == X) orderBy(time desc) limit(20)` |
| Seguidores/seguindo | `users/{uid}/{followers|following} orderBy(createdAt desc) limit(20)` |
| Ranking | `rankingMonthly/{month}/entries orderBy(score desc) limit(20)` |
| Resumo de nota | leitura única de `ratingSummaries/{titleKey}` com cache |
| Estatísticas do usuário | leitura única de `userStats/{uid}` com cache |
| Perfil público | leitura única de `users/{uid}` com cache |
| Listas administrativas | cursor opaco por último documento, `limit(20)` (máximo explícito de 50) |

O fallback do array legado de reviews é somente leitura. Ele mantém o array já baixado no cursor para não reler o documento grande a cada página. Deve ser removido após a migração.

## Escritas e agregados confiáveis

As Cloud Functions em `functions/index.js` são responsáveis por:

- atualizar `ratingSummaries` em transação quando uma nota é criada, alterada ou removida;
- impedir contagens negativas com `Math.max(0, ...)`;
- manter `commentsCount` e `ratingsCount` no usuário;
- espelhar `following` para `followers` e ajustar os dois contadores;
- derivar `listsCount` e `watchedCount` quando as listas mudam;
- atualizar ranking e `userStats` quando a atividade muda;
- atualizar métricas globais/diárias/mensais;
- registrar cada evento em `systemEvents`, tornando retentativas idempotentes;
- paginar varreduras agendadas de usuários em blocos de 100, evitando `.get()` sem limite.

O cliente não tem permissão para escrever contadores, resumos, ranking, métricas, espelhos de seguidores ou recibos operacionais.

## Imagens

Novos avatares e capas:

- aceitam JPG, PNG e WebP de até 15 MB como origem;
- validam dimensões máximas de 12.000 × 12.000;
- são redimensionados e convertidos para WebP no cliente;
- geram avatar principal (até 512 px) e thumbnail (até 256 px);
- geram capa de até 1.600 × 1.000;
- usam nomes versionados e cache imutável de um ano;
- só removem o arquivo anterior depois que o perfil foi salvo;
- removem o novo upload se a gravação do perfil falhar.

As regras aceitam somente WebP, até 5 MB por objeto, com `ownerUid` correspondente ao usuário autenticado.

Imagens base64 legadas podem ser migradas com a tarefa opcional `images`. Ela requer `sharp` no ambiente de migração e nunca é executada pelo build.

## Cache e listeners

### Cache

`src/lib/cache.ts` combina memória e `localStorage`, deduplica promessas em andamento e pode devolver cache expirado quando a rede falha.

| Dado | TTL |
|---|---:|
| Configuração global | 5 min |
| Perfil público | 5 min |
| Resumo de nota | 2 min |
| Detalhe TMDB | 30 min |
| Seção de home/TMDB | 10 min |
| Listas/estatísticas recentes | 2 min |

O SDK Firestore usa persistência local multiaba quando suportada. Mutações de perfil e nota invalidam as chaves relacionadas.

### Listeners auditados

| Listener | Classificação | Decisão |
|---|---|---|
| `users/{uid}` | necessário enquanto autenticado | mantido e cancelado no cleanup |
| `users/{uid}/private/pro_settings` | necessário para preferências PRO entre dispositivos | mantido e cancelado no cleanup |
| `config/app_settings` | atualização rara | listener removido; cache + refresh em `visibilitychange`/`online` |

Em desenvolvimento, `window.__MARATONOU_DATA_COST__.snapshot()` mostra consultas, documentos retornados, listeners ativos, requisições duplicadas bloqueadas e redução de bytes de imagem.

## Índices e isenções

`firestore.indexes.json` inclui os compostos necessários para:

- notificações sociais por destinatário/data;
- notificações do app por destinatário/data;
- atividades por usuário/data;
- compatibilidade de exclusão por usuário/título.

Também declara o índice de escopo `COLLECTION_GROUP` para `items.date`, usado
pela moderação paginada. As listas administrativas de conteúdo, atividades,
denúncias e logs usam cursores opacos e nunca ampliam o `limit` com o número da
página; como uma contagem exata dessas consultas exigiria uma leitura agregada
adicional, a interface usa apenas o estado limitado de “há próxima página”.

Campos grandes que não são consultados (`text`, `mediaUrl`, `replies`, `likedBy`, listas e mapa de episódios) têm indexação desativada. `systemEvents.expiresAt` possui política TTL.

## Regras de segurança

Arquivos de origem:

- `firestore.rules`
- `storage.rules`

Garantias principais:

- usuário não altera `adminAccess`, `accountStatus` nem `counters`;
- autor não pode ser trocado em comentário ou nota;
- nota deve ser inteiro entre 1 e 10;
- usuário só grava sua própria relação `following` e não pode seguir a si mesmo;
- `followers`, resumos, ranking, métricas e recibos são somente servidor;
- notificações só são lidas pelo destinatário;
- imagens só são gravadas/removidas pelo proprietário.

## Migração

Script: `scripts/migrations/optimize-firestore.mjs`

```bash
# credenciais de um clone/emulador
export FIREBASE_SERVICE_ACCOUNT_PATH=/caminho/service-account.json
export FIREBASE_STORAGE_BUCKET=projeto.appspot.com

# simulação, padrão e sem escritas
npm run migrate:firebase:dry

# tarefa isolada em simulação
node scripts/migrations/optimize-firestore.mjs --task=profiles

# aplicar depois da validação
npm run migrate:firebase:apply

# retomar usa o cursor salvo; reiniciar uma tarefa idempotente
node scripts/migrations/optimize-firestore.mjs --apply --task=reviews --restart

# base64 -> Storage/WebP (dependência somente no ambiente de migração)
npm install --save-dev sharp
node scripts/migrations/optimize-firestore.mjs --task=images
```

Características:

- dry-run por padrão;
- páginas e lotes configuráveis, limitados a 200;
- retentativa com backoff;
- IDs determinísticos e `set(..., merge: true)`;
- cursor local para retomada;
- tarefas independentes: `profiles`, `reviews`, `activity`, `images`, `metrics`;
- relatório final de leituras, escritas, itens ignorados e relações não resolvidas.

O relatório de dry-run deve ser arquivado antes de qualquer `--apply`. O script não apaga arrays legados, imagens antigas nem documentos de origem automaticamente.

## Estimativa conservadora de custo

As reduções abaixo são por abertura típica, sem contar cache:

| Fluxo | Antes | Depois | Redução estimada |
|---|---:|---:|---:|
| Feed inicial | 60 atividades + review legado + N detalhes | 20 atividades denormalizadas | pelo menos 67% nas atividades e elimina N+1 |
| Ranking | até 500 atividades + até 500 perfis | 20 líderes + 1 entrada do usuário | até ~98% |
| Estatísticas | até 500 atividades | 1 agregado | até ~99% |
| Seguidores | até 4 consultas × 50 | 20 relações | até ~90% em perfis com aliases |
| Nota média | todos os reviews do título | 1 resumo | aproxima-se de 100% conforme cresce o título |
| Painel geral | contagens/varredura do Auth | 1 global + 2–7 agregados + 8 logs | custo fixo e previsível |
| Lista administrativa | até 500/1.000 documentos pré-carregados | 20 documentos por página | 96–98% na primeira página |

Valores exatos dependem do tráfego, tamanho da base, taxa de cache e quantidade de páginas abertas. A instrumentação de desenvolvimento deve ser usada para comparar os mesmos fluxos antes/depois.

## Dependências de servidor

- Firebase Admin SDK nas rotas administrativas e no script;
- Cloud Functions v2 para agregados e workers;
- Firebase Storage para avatar/capa;
- segredo `TMDB_API_KEY` nas Functions;
- credenciais Admin apenas no servidor;
- `sharp` somente para a tarefa opcional de migração de imagens.

## Riscos atuais e futuros

1. O documento raiz do usuário ainda contém listas e `ep_watched`; o tamanho agora está protegido da maior fonte (imagens), mas uma conta extrema pode exigir migração dessas listas para subcoleções.
2. Replies continuam embutidos no documento do comentário por compatibilidade. Threads grandes devem migrar para `reviews/{title}/items/{review}/replies/{reply}`.
3. O score usa 90 minutos como estimativa para uma atividade `watched`, pois a atividade histórica não guarda duração. Novas atividades podem ganhar `runtimeMinutes` para precisão.
4. Métricas diárias/mensais só ficam completas após backfill. Até lá, o painel mostra “Indisponível”, não números inventados.
5. A busca administrativa por usuário é prefixada por username ou exata por e-mail/UID. Busca textual ampla exigirá índice dedicado (Algolia/Typesense/Elastic ou coleção de busca normalizada).
6. A fila automática ainda precisa visitar usuários elegíveis; agora o faz em páginas de 100. Em escala maior, índices de inscrição por evento/plataforma devem substituir a varredura agendada.
7. Exclusão completa de conta precisa de uma Function recursiva/Extensão Delete User Data para remover subcoleções e arquivos de Storage; apagar só o documento raiz não remove subcoleções.
