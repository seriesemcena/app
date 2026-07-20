# Séries em Cena — Web

Port em produção (Next.js 14 + TypeScript) do protótipo HTML/JSX.

## Setup

```bash
pnpm install   # ou npm install / yarn
pnpm dev       # http://localhost:3000
```

A chave TMDB já está em `.env.local` (apenas server-side, nunca exposta ao cliente).

## Estrutura

- `src/app/*` — rotas (App Router)
- `src/app/api/tmdb/*` — proxy server-side para TMDB
- `src/components/*` — componentes compartilhados (Icon, PosterCard, TabBar, etc.)
- `src/lib/tokens.ts` — tokens de design
- `src/lib/tmdb.ts` — cliente TMDB
- `src/lib/store.ts` — preferências e reviews em localStorage

## Telas implementadas (iteração 1)

- Splash, Onboarding, Auth
- Home (com hero carousel + tabs Para Você / Em Alta / Novidades)
- Search (busca + filtros)
- Title detail (sinopse, elenco, onde assistir, episódios)

## Próxima iteração

Calendar, Lists, Profile, PRO, Notifications, Settings, Expenses, Recommendations, AI Assistant, Episode, Actor.
