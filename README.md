# SRC Digital — veille des appels d'offres publics du Burkina Faso

Collecte quotidienne du *Quotidien des marchés publics* (DGCMEF), extraction des avis, matching avec le profil
de chaque entreprise et digest e-mail à 07:00 (heure de Ouagadougou).

Spécification : `README_SRC_Digital_Claude.md` · Plan et API : `PLAN.md` · Avancement : `PROGRESS.md` ·
Décisions : `DECISIONS.md` · Preuves de validation : `VALIDATION.md`.

## Prérequis (macOS, sans Docker)

- Node ≥ 22.11 et pnpm 8.15 (`corepack enable`)
- Python 3.12
- PostgreSQL 17 : `brew install postgresql@17 && brew services start postgresql@17`
- pdftotext : `brew install poppler`

## Installation

```bash
pnpm setup:check   # vérifie les prérequis
pnpm setup         # .env (JWT_SECRET généré), dépendances, bases tender_watch(_test), migrations, seed
```

Pour créer le super administrateur, renseignez `SUPER_ADMIN_EMAIL` et `SUPER_ADMIN_PASSWORD` (≥ 12 caractères)
dans `.env`, puis `pnpm db:seed`.

## Lancer

| Commande | Effet |
|---|---|
| `pnpm dev` | API (http://localhost:4000) + web (http://localhost:3000), rechargement à chaud |
| `pnpm build && pnpm start` | binaires compilés |
| `pnpm collector run-job <id>` | exécute un job de collecte à la main |

En développement, `EMAIL_PROVIDER=log` : les e-mails sont écrits dans la console et dans la table `email_outbox`
(liens de vérification inclus). Le cron 07:00 s'active avec `PIPELINE_CRON_ENABLED=true`.

## Tests

| Commande | Contenu |
|---|---|
| `pnpm lint` | ESLint API/web, types web, ruff |
| `pnpm test` | unitaires API (Jest), web (Vitest), collecteur (pytest) |
| `pnpm test:e2e:api` | e2e API sur `tender_watch_test` (vidée à chaque suite) |
| `pnpm test:e2e` | Playwright sur la stack complète (ports 4100/3100, faux collecteur) |
| `pnpm test:all` | tout |

Premier lancement Playwright : `pnpm --filter web exec playwright install chromium`.

## Base de données

| Commande | Effet |
|---|---|
| `pnpm db:migrate` | applique les migrations |
| `pnpm db:seed` | source DGCMEF + super admin (idempotent) |
| `pnpm db:backup` | sauvegarde dans `backups/` (non versionné) |
| `pnpm db:restore backups/<fichier>.dump` | restauration (confirmation demandée) |
| `pnpm db:reset` | efface et recrée la base de développement (confirmation demandée) |

## Règles

Voir `CLAUDE.md` : ne jamais inventer une donnée (absent = « Non précisé »), isolation stricte entre
entreprises, aucun secret dans Git, jobs idempotents, échec de collecte toujours visible, respect des sources
(robots.txt, User-Agent identifié, ≥ 5 s entre requêtes).
