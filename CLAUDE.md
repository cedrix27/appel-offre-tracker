# CLAUDE.md — conventions du projet SRC Digital

SaaS de veille des appels d'offres publics du **Burkina Faso**. Spécification : `README_SRC_Digital_Claude.md`.
Plan et contrat d'API : `PLAN.md`. Avancement : `PROGRESS.md`. Décisions : `DECISIONS.md`.

## Règles non négociables
1. **Ne jamais inventer** une date limite, un montant, un organisme ou une condition. Absent = `null`, affiché « Non précisé ».
2. Conserver pour chaque annonce : source, URL officielle, pages, texte brut, date de collecte, preuves.
3. **Multi-tenant** : `companyId` vient uniquement de la session (JWT). Toute requête sur `tender_matches`,
   `saved_tenders`, `watch_preferences`, `notifications`, `company_members` filtre par `companyId`.
   Ressource d'une autre entreprise → **404** (pas 403, pas de fuite d'existence).
4. Aucun secret dans le code, le front ou Git. `.env` n'est jamais commité ; `.env.example` = valeurs fictives.
5. Jobs idempotents (clés d'idempotence uniques) : une relance ne crée ni doublon ni e-mail répété.
6. Une collecte en échec n'est **jamais** présentée comme « aucun nouvel appel d'offres ».
7. Ne jamais désactiver ou affaiblir un test pour le faire passer.
8. Respect des sources : `robots.txt`, User-Agent identifié, ≥ 5 s entre requêtes, pas de contournement.
9. Toute l'interface et les e-mails sont **en français**.

## Structure
```text
apps/web            Next.js 16 (App Router), Tailwind v4, shadcn/ui — port 3000
apps/api            NestJS 11 + Prisma 6 — port 4000 (schéma : apps/api/prisma/schema.prisma)
services/collector  Python 3.12 (venv .venv) — connecteurs, extraction, IA
packages/shared     taxonomy.json, tender-extraction.schema.json
docs/               cadrage, audit des sources, design system
```

## Commandes
| But | Commande (depuis la racine) |
|---|---|
| Installer | `pnpm install` puis `cd services/collector && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'` |
| BDD | PostgreSQL 17 Homebrew : `brew services start postgresql@17` ; bases `tender_watch`, `tender_watch_test` |
| Migrations | `pnpm --filter api exec prisma migrate dev --name <nom>` ; seed : `pnpm --filter api db:seed` |
| Dev | `pnpm dev` (API + web) — ou `pnpm dev:api`, `pnpm dev:web` |
| Tests API | `pnpm --filter api test` (unit) · `pnpm --filter api test:e2e` (BDD `tender_watch_test`) |
| Tests web | `pnpm --filter web test` (Vitest) · `pnpm test:e2e` (Playwright, stack complète) |
| Tests collecteur | `cd services/collector && .venv/bin/pytest` · lint `.venv/bin/ruff check .` |
| Lint / types | `pnpm --filter api lint` · `pnpm --filter web lint` · `pnpm --filter web typecheck` |
| Build | `pnpm --filter api build` · `pnpm --filter web build` |
| Tout | `pnpm test:all` |

Node 22.11 local : les scripts Next utilisent `NODE_OPTIONS=--experimental-require-module` (D23).

## Conventions de code
- TypeScript `strict`, pas de `any` implicite ; validation de **toutes** les entrées serveur avec Zod (`ZodValidationPipe`).
- API : un module Nest par domaine (`auth`, `company`, `preferences`, `tenders`, `matching`, `pipeline`,
  `notifications`, `dashboard`, `admin`, `mail`, `reference`, `prisma`, `health`). Services testables, contrôleurs fins.
- BigInt Prisma → `number` dans les réponses JSON (montants FCFA < 2^53).
- Dates : stockées UTC ; formatées `Africa/Ouagadougou`, locale `fr-FR`.
- Web : composants shadcn dans `src/components/ui` ; tokens de `globals.css` (`bg-brand`, `text-ink-2`…) — pas de couleurs en dur.
  Bouton principal noir (`default`), appel à l'action rouge (`brand`). Cibles ≥ 44 px. Couleur jamais seule porteuse de sens.
- Python : modules typés, pydantic pour la validation, `ruff` propre, pas d'`except:` nu.
- Tests à côté du code (`*.spec.ts`), e2e API dans `apps/api/test/`, Playwright dans `e2e/`, pytest dans `services/collector/tests/`.
- Commits : `type(scope): message` en français (ex. `feat(api): authentification et vérification e-mail`).
