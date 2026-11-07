# PLAN — SRC Digital, veille des appels d'offres (Burkina Faso)

Spécification source : `README_SRC_Digital_Claude.md` (« le README »). Décisions : `DECISIONS.md`.
Audit des sources : `docs/02-audit-sources.md`. Design : `docs/05-design-system-src.md`.

## 1. Stack

| Couche | Techno | Dossier |
|---|---|---|
| Front | Next.js 16.4 (App Router, TS strict), Tailwind v4, shadcn/ui (base-nova), lucide | `apps/web` |
| API | NestJS 11, TS strict, Prisma 6.19, Zod 3, Argon2id, cookie JWT, @nestjs/schedule, @nestjs/throttler, nodemailer | `apps/api` |
| Collecteur | Python 3.12, httpx, psycopg 3, pydantic 2, `pdftotext` (poppler), OpenAI Responses API | `services/collector` |
| Contrats partagés | JSON Schema de l'extraction IA, taxonomie | `packages/shared` |
| BDD | PostgreSQL 17 (Homebrew) — `tender_watch` (dev), `tender_watch_test` (tests) | — |
| Tests | Jest + Supertest (API), pytest (collecteur), Vitest (web), Playwright (e2e) | — |

Pas de Docker, pas de Redis (D6, D8).

## 2. Architecture

```text
 Navigateur ──► Next.js :3000 ── rewrite /api/* ──► NestJS :4000 ──► PostgreSQL
                                                    │  cron 07:00 Africa/Ouagadougou
                                                    │  PipelineService
                                                    │   1. crée collector_jobs (idempotent)
                                                    │   2. spawn `python -m collector run-job <id>`
                                                    │   3. MatchingService (tenders × préférences)
                                                    │   4. DigestService (1 e-mail / entreprise / jour)
                                                    ▼
                                      services/collector (Python)
                                      DGCMEF : liste HTML → PDF → pdftotext
                                      → segmentation en avis → extraction (OpenAI | règles)
                                      → validation pydantic → upsert tenders (content_hash)
```

Règles : dates en UTC en base ; affichage et planification `Africa/Ouagadougou` (UTC+0).
Annonces globales ; préférences, matches, favoris, notifications cloisonnés par `company_id`.
`company_id` provient **uniquement** de la session (JWT), jamais d'un paramètre client.

## 3. Modèle de données

Source de vérité : `apps/api/prisma/schema.prisma` (tables `snake_case`). Tables :
`users, auth_tokens, companies, company_members, watch_preferences, sources, collector_jobs,
source_runs, source_publications, tenders, tender_documents, tender_matches, saved_tenders,
notifications, email_outbox, pipeline_runs, audit_logs`.

Le collecteur Python écrit `collector_jobs` (statut), `source_runs`, `source_publications`,
`tenders`, `tender_documents`. L'API écrit tout le reste.

## 4. Référentiels

**Secteurs (taxonomie contrôlée, codes)** — `packages/shared/taxonomy.json` :
`informatique` (Informatique & télécoms), `btp` (BTP & génie civil), `hydraulique` (Eau, hydraulique & assainissement),
`energie` (Énergie & électricité), `fournitures_bureau` (Fournitures & mobilier de bureau), `vehicules` (Véhicules & engins),
`sante` (Santé & médicaments), `agriculture` (Agriculture, élevage & environnement), `etudes_conseil` (Études, conseil & formation),
`restauration` (Restauration & événementiel), `nettoyage_securite` (Nettoyage, gardiennage & sécurité),
`impression_communication` (Impression & communication), `transport_logistique` (Transport & logistique), `autres` (Autres).
Chaque secteur porte une liste de mots-clés indicatifs utilisés par l'extracteur à règles.

**Types de procédure** : `Demande de prix`, `Appel d'offres ouvert`, `Appel d'offres restreint`,
`Manifestation d'intérêt`, `Demande de propositions`, `Autre`.

**Zones** : texte libre normalisé ; suggestions = principales villes (Ouagadougou, Bobo-Dioulasso,
Koudougou, Ouahigouya, Kaya, Banfora, Dédougou, Fada N'Gourma, Tenkodogo, Ziniaré, Manga, Gaoua, Dori)
+ `National`. (Le découpage régional a changé en 2025 : on ne fige pas une liste de régions.)

## 5. Contrat d'API (NestJS, préfixe aucun ; le web l'appelle via `/api/...`)

Conventions : JSON, camelCase, montants en `number` (FCFA, BigInt sérialisé), dates ISO-8601 UTC.
Erreurs : `{ statusCode, message, code? }`. Pagination : `{ items, total, page, pageSize }`.
Auth : cookies `httpOnly` `access_token` (15 min) et `refresh_token` (30 j, path `/auth`).
Rôles : `SUPER_ADMIN` (global), `COMPANY_ADMIN`, `COMPANY_MEMBER` (membership).

### Auth
| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/auth/register` | `{ companyName, fullName, email, password (≥12) }` | 201 `{ user }` ; e-mail de vérification envoyé ; l'utilisateur devient COMPANY_ADMIN |
| POST | `/auth/verify-email` | `{ token }` | 200 `{ ok: true }` |
| POST | `/auth/resend-verification` | `{ email }` | 202 (toujours) |
| POST | `/auth/login` | `{ email, password }` | 200 `{ user }` + cookies ; 401 identifiants ; 403 `code: EMAIL_NOT_VERIFIED` / `ACCOUNT_SUSPENDED` |
| POST | `/auth/refresh` | — | 200 + cookies tournés |
| POST | `/auth/logout` | — | 204, cookies effacés, refresh révoqué |
| POST | `/auth/forgot-password` | `{ email }` | 202 (toujours, pas d'énumération) |
| POST | `/auth/reset-password` | `{ token, password }` | 200 ; révoque les refresh tokens |
| POST | `/auth/accept-invite` | `{ token, password }` | 200 (membre invité définit son mot de passe ; e-mail vérifié) |
| GET | `/me` | — | `{ user: {id,email,fullName,globalRole}, company: {id,legalName,status} \| null, membership: {role} \| null }` |

### Entreprise (membre requis ; écriture = COMPANY_ADMIN)
| Méthode | Route | Notes |
|---|---|---|
| GET | `/company` | profil complet (§6.3 du README) |
| PATCH | `/company` | champs du profil (validation Zod) |
| GET | `/company/members` | `[{ id, userId, email, fullName, role, invitedPending }]` |
| POST | `/company/members` | `{ email, fullName, role }` → crée l'utilisateur + e-mail d'invitation |
| DELETE | `/company/members/:id` | interdit de supprimer le dernier COMPANY_ADMIN |

### Préférences & référentiels
| Méthode | Route | Notes |
|---|---|---|
| GET | `/reference/taxonomy` | `{ sectors: [{code,label}], procedureTypes: [], zones: [] }` (public) |
| GET | `/watch-preferences` | liste de l'entreprise |
| POST | `/watch-preferences` | `{ name, sectors[], keywordsInclude[], keywordsExclude[], procedureTypes[], regions[], budgetMin?, budgetMax?, minScore, recipients[], isActive }` |
| PATCH | `/watch-preferences/:id` | partiel ; 404 si autre entreprise |
| DELETE | `/watch-preferences/:id` | 204 |

### Annonces (membre requis)
| Méthode | Route | Notes |
|---|---|---|
| GET | `/tenders` | query : `q, sector, organization, region, procedureType, from, to (publication), deadlineFrom, deadlineTo, onlyMatched (bool, défaut true), favorite, savedStatus, includeClosed, sort (relevance\|deadline\|recent), page, pageSize (≤50)` → items `TenderListItem` |
| GET | `/tenders/:id` | `TenderDetail` |
| POST | `/tenders/:id/favorite` | `{ isFavorite }` → `{ isFavorite, status }` |
| PATCH | `/tenders/:id/status` | `{ status: TO_REVIEW\|INTERESTED\|APPLYING\|IGNORED, note? }` |
| GET | `/tenders/filters` | `{ organizations: [], sectors: [], procedureTypes: [], locations: [] }` (valeurs présentes) |

`TenderListItem` = `{ id, title, reference, organization, categories, sectors, procedureType, location,
publicationDate, submissionDeadline, deadlineHasTime, estimatedBudget, budgetTaxBasis, summary,
status, missingOrUncertainFields, source: { code, name }, sourceUrl, sourcePages,
match: { score, reasons:[{code,label,points}], matchedKeywords } | null,
saved: { isFavorite, status } | null, isNew (match < 48 h) }`.
`TenderDetail` = `TenderListItem` + `{ description, fundingSource, eligibilityRequirements[], requiredDocuments[],
documents:[{label,url}], evidence, collectedAt, lastVerifiedAt, extractionModel,
publication: { externalRef, publicationDate, fileUrl, pageUrl } | null, note }`.

### Dashboard & alertes
| Méthode | Route | Réponse |
|---|---|---|
| GET | `/dashboard/summary` | `{ newMatches24h, newMatches7d, openMatches, favorites, deadlinesSoon: TenderListItem[≤5], recentMatches: TenderListItem[≤5], collection: { sourceName, lastRunAt, lastOutcome, latestPublicationRef, latestPublicationDate } }` |
| GET | `/notifications` | `[{ id, digestDate, status, recipients, tenderCount, subject, sentAt, error }]` |

### Administration (SUPER_ADMIN)
| Méthode | Route | Notes |
|---|---|---|
| GET | `/admin/stats` | compteurs : entreprises, utilisateurs, annonces, matches, e-mails envoyés/échoués, dernier pipeline |
| GET | `/admin/companies` | liste + nb membres + statut |
| PATCH | `/admin/companies/:id` | `{ status: ACTIVE\|SUSPENDED }` (audit log) |
| GET | `/admin/users` | liste ; PATCH `/admin/users/:id` `{ status }` |
| GET | `/admin/sources` · POST `/admin/sources` · PATCH `/admin/sources/:id` | registre des sources |
| POST | `/admin/sources/:id/run` | 202 `{ jobId, runId? }` — relance contrôlée (refus si un job RUNNING existe) |
| GET | `/admin/source-runs` | `?sourceId&page` — outcome SUCCESS_NEW / SUCCESS_NONE / FAILED distincts |
| GET | `/admin/tenders` | toutes les annonces + extraction |
| GET | `/admin/notifications` | tous les envois + statut |
| POST | `/admin/pipeline/run` | `{ date? }` — relance pipeline (matching + digest idempotents) |
| GET | `/admin/pipeline-runs` | historique |
| GET | `/health` | `{ status: "ok", db: "ok" }` (public) |

## 6. Contrat collecteur (Python)

CLI `python -m collector …` (depuis `services/collector`, venv `.venv`) :
- `run-job <job_id>` : traite un job COLLECT (verrou, run, publication(s), avis), code retour 0/1.
- `worker [--once]` : boucle sur les jobs PENDING (`FOR UPDATE SKIP LOCKED`).
- `ingest <pdf> --source dgcmef --ref "Quotidien n°4514" --date 2026-10-21 --url <pdf_url>` : ingestion manuelle.
- `discover --source dgcmef` : liste les publications trouvées (sans écrire).
Variables : `DATABASE_URL`, `AI_PROVIDER=openai|mock`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
`COLLECTOR_USER_AGENT`, `COLLECTOR_MIN_DELAY_SECONDS`, `COLLECTOR_STORAGE_DIR`,
`COLLECTOR_OFFLINE_FIXTURES` (dossier : si défini, le connecteur lit liste HTML + PDF locaux, aucun réseau — utilisé par les tests e2e).
Payload du job : `{ "maxPublications": 3 }`.
Idempotence : publication = (source, external_ref) + sha256 ; avis = `content_hash` SHA-256 du texte normalisé.
Si le hash d'une publication est inchangé → pas de retraitement. Un avis existant → `last_verified_at` mis à jour.
Schéma d'extraction : `packages/shared/tender-extraction.schema.json` (structured outputs strict).

## 7. Matching (API, TypeScript, déterministe — D15/D16)

Pour chaque (annonce non clôturée, préférence active) : exclusion trouvée → rejet. Sinon score :
secteur commun (35) ; mots-clés inclus trouvés dans titre/objet/description (40 × trouvés/total, min 15 si ≥1) ;
zone (10, ou 5 si annonce sans lieu) ; budget dans la fourchette (10, ou 5 si budget non publié) ;
procédure (5, ou 5 si la préférence n'en filtre aucune). Il faut ≥1 secteur OU ≥1 mot-clé.
Score retenu si ≥ `minScore`. Meilleure préférence conservée (`tender_matches` unique company×tender).
Normalisation : minuscules, sans accents, mots entiers. `reasons` lisibles en français.

## 8. Digest e-mail

Par entreprise active ayant ≥1 match non notifié : 1 e-mail/jour, clé `digest:<companyId>:<date>` unique.
Contenu (README §6.8) : date, nombre, pour chaque annonce titre, organisme, objet, date limite si vérifiée
(sinon « Non précisé »), résumé, score + raisons, lien fiche SaaS, lien source officielle, champs non précisés.
Bandeau si la dernière collecte a échoué (« la collecte n'a pas pu être effectuée » ≠ « aucune annonce »).
Si 0 match → pas d'e-mail, notification `SKIPPED` journalisée. Redémarrage → pas de double envoi.

## 9. Tâches

Voir `PROGRESS.md` (checklist, critères d'acceptation, agent responsable).
