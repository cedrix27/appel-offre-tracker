# 01 — Cadrage technique (5 novembre 2026)

## 1. État du dépôt

| Élément | Constat |
|---|---|
| Fichiers | `README_SRC_Digital_Claude.md` (cahier des charges), `design-system.md` |
| Code existant | Aucun. Pas de `package.json`, pas de collecteur, pas de migration |
| Git | Le dossier **n'est pas un dépôt Git** (à initialiser avant le socle) |
| Outils locaux | Node 22.11, pnpm 8.15, Python 3.12, PostgreSQL 17 (Homebrew), `pdftotext`/`pdfinfo` (poppler) |
| Absents | Docker, Redis, `uv` |

**Point d'attention — design system.** `design-system.md` décrit le produit
**WelcomeBack** (fidélité restaurant, carte de tampons). Ce n'est pas SRC Digital.
Hypothèse retenue : on réutilise son **langage visuel** (« papier chaud »,
couleurs, typographie, rayons, motion) et on ignore la partie métier (carte de
fidélité). L'adaptation est décrite dans [`05-design-system-src.md`](05-design-system-src.md).
→ *À valider.*

## 2. Architecture proposée

Monolithe modulaire + workers, conforme au §3 du cahier des charges.

```text
appel-d-offre-tracker/
├── apps/
│   ├── web/              Next.js 15 (App Router) + Tailwind + shadcn/ui
│   └── api/              NestJS 11 — point d'entrée métier, auth, scheduler, e-mails
├── services/
│   └── collector/        Python 3.12 — connecteurs, PDF→texte, segmentation, appels OpenAI
├── packages/
│   └── shared/           Schémas Zod partagés (contrats API, schéma d'extraction IA)
├── infrastructure/       docker-compose (Postgres + Redis + Mailpit), scripts de sauvegarde
├── docs/
├── .env.example
└── pnpm-workspace.yaml
```

### Choix techniques (hypothèses documentées)

| Sujet | Choix | Raison |
|---|---|---|
| Monorepo | pnpm workspaces (sans Turborepo au départ) | Simple, déjà installé |
| ORM / migrations | **Prisma** côté NestJS (migrations versionnées `prisma migrate`) | Typage strict, migrations lisibles |
| Isolation multi-tenant | `company_id` partout + garde NestJS `CompanyScopeGuard` + **Row Level Security Postgres** en défense en profondeur (phase Tests & sécurité) | Exigence §7 |
| Auth | JWT court en cookie `httpOnly` + refresh token en base, Argon2id | §6.2 |
| Files de tâches | **Redis + BullMQ** côté NestJS. Le collecteur Python est un *worker HTTP-less* : il lit ses jobs dans une table `collector_jobs` (Postgres, `SELECT … FOR UPDATE SKIP LOCKED`) | Évite d'avoir deux systèmes de queue (BullMQ + Celery) et rend Python indépendant de BullMQ |
| Communication NestJS ↔ Python | Base Postgres partagée : Python écrit `source_runs`, `tenders`, `tender_documents`; NestJS fait matching + e-mails | Contrat simple, idempotent (voir `03-modele-donnees.md`) |
| OCR | Non nécessaire pour les quotidiens DGCMEF (PDF Word natifs). Tesseract en option pour les pages-images | Audit §2 |
| IA | OpenAI Responses API, **Structured Outputs** (`json_schema`, `strict: true`) | §6.6 |
| E-mail | Provider abstrait ; **Mailpit** en local, Brevo/Resend/Postmark en prod (à choisir) | §6.8 |
| Fuseau | Stockage UTC ; `Africa/Ouagadougou` = UTC+0 sans DST, affichage `fr-BF` | §3 |

### Flux quotidien

```text
07:00 BF  BullMQ (api)  ──► insère collector_jobs(source=dgcmef)
          collector     ──► découvre nouveaux Quotidiens ──► télécharge PDF ──► pdftotext
                        ──► segmente en avis ──► upsert tenders (hash) ──► OpenAI extraction
                        ──► marque le job DONE / FAILED (source_runs)
          api           ──► à la fin du run : matching par entreprise ──► tender_matches
                        ──► digest (clé d'idempotence company_id + date) ──► notifications
```

## 3. Décisions validées (5 novembre 2026)

1. Design system : même style « papier chaud », **thème rouge / blanc / noir** (boutons noirs et rouges).
2. NestJS ↔ Python via Postgres (`collector_jobs`) — pas de Celery.
3. Prisma pour l'ORM et les migrations.
4. E-mail : **Brevo** en production, Mailpit en local.
5. Pas de Docker : **PostgreSQL Homebrew** (+ Redis Homebrew pour BullMQ).
6. Conservation des PDF : 24 mois.
7. Front : **Next.js 16 + shadcn/ui** (Tailwind v4).

Encore ouverts : modèle OpenAI exact, résultats d'attribution (V2).

### Note environnement
Node 22.11 ne supporte pas `require()` d'un module ESM sans option (nécessaire au
plugin Tailwind/Turbopack). Les scripts `apps/web` passent
`NODE_OPTIONS=--experimental-require-module`. Recommandé : passer à Node ≥ 22.12
(ou 24 LTS), puis retirer l'option.
