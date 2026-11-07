# PROGRESS — checklist des tâches

Légende agent : ARC architect · BE backend-dev · FE frontend-dev · TE test-engineer · CR code-reviewer · OPS devops.
Une tâche n'est cochée que si build + lint + tests passent et qu'un commit existe.

## Phase 0 — Cadrage
- [x] **T00** (ARC) Audit dépôt + sources, docs/01–05 — *critère : docs présents, audit DGCMEF réel*
- [x] **T01** (FE) Socle Next.js + shadcn + thème rouge/noir, page d'accueil — *build/lint/test verts*
- [x] **T02** (ARC) PLAN.md, PROGRESS.md, DECISIONS.md, CLAUDE.md, agents `.claude/agents/`, schéma Prisma

## Phase 1 — Socle API
- [ ] **T03** (BE) NestJS 11 + Prisma : config Zod, PrismaService, `/health`, ValidationPipe Zod, filtre d'erreurs, throttler, cookie-parser, migration initiale, seed (source DGCMEF + super admin) — *`pnpm --filter api test` vert, `/health` = ok*
- [ ] **T04** (BE) Auth complète (register, verify-email, resend, login, refresh, logout, forgot/reset, accept-invite, `/me`), Argon2id, MailProvider (log/smtp/brevo) + `email_outbox` — *e2e : parcours complet, jetons à usage unique, 403 non vérifié, rate-limit login*
- [ ] **T05** (BE) Entreprise & membres (profil, invitation, rôles) — *e2e : MEMBER ne peut pas PATCH, dernier admin protégé*
- [ ] **T06** (BE) Préférences de veille + `/reference/taxonomy` — *e2e CRUD + 404 inter-entreprise*

## Phase 2 — Collecte (Python)
- [ ] **T07** (BE-py) Connecteur DGCMEF : découverte liste HTML, téléchargement PDF (ETag, délai, UA), mode fixtures hors-ligne, `pdftotext`, segmentation en avis + pages — *pytest : 14 avis sur le n°4514, pieds de page retirés*
- [ ] **T08** (BE-py) Extraction : règles (référence, organisme, procédure, date limite, budget, financement) + OpenAI structured outputs + validation pydantic + jamais d'invention ; persistance idempotente (jobs, runs, publications, tenders) — *pytest : relance = 0 doublon ; champs absents = NULL ; outcome SUCCESS_NEW/NONE/FAILED*

## Phase 3 — Métier API
- [ ] **T09** (BE) Annonces : liste filtrée/recherche/pagination, détail, favoris, statut de suivi, filtres — *e2e : filtres, isolation saved/match*
- [ ] **T10** (BE) Moteur de matching + raisons — *unit : barème §7, exclusions, accents*
- [ ] **T11** (BE) Pipeline quotidien : cron 07:00 BF, jobs idempotents, spawn collecteur, matching, digest e-mail responsive, notifications — *e2e : 2 lancements = 1 e-mail ; échec collecte visible*
- [ ] **T12** (BE) `/dashboard/summary`, `/notifications` — *e2e*
- [ ] **T13** (BE) Administration (stats, entreprises, utilisateurs, sources, runs, relance, notifications, audit log) — *e2e : 403 pour non SUPER_ADMIN*

## Phase 4 — Front
- [ ] **T14** (FE) Auth branchée : inscription, vérification, connexion, mot de passe oublié/réinitialisation, invitation, déconnexion, garde de routes
- [ ] **T15** (FE) Onboarding : profil entreprise, préférences (secteurs, mots-clés, exclusions, zones, budget, seuil, destinataires, activation), membres
- [ ] **T16** (FE) Dashboard, liste d'annonces (filtres, recherche, tri), fiche détaillée (source officielle, « Non précisé »), favoris & statut, historique des alertes
- [ ] **T17** (FE) Administration : stats, entreprises (suspendre), sources (relancer), historique collectes (3 états), notifications, annonces
- [ ] **T17b** (FE) Pages légales (mentions, confidentialité) + contact/démo

## Phase 5 — Qualité & livraison
- [ ] **T18** (TE) Tests d'isolation multi-tenant A/B sur toutes les routes cloisonnées
- [ ] **T19** (TE) Playwright e2e : inscription → vérification → connexion → profil → préférences → collecte (fixtures) → matching → dashboard → fiche → favori → digest ; admin relance
- [ ] **T20** (OPS) Scripts (`setup`, `dev`, `test:all`, `db:*`), CI GitHub Actions, `.env.example` complet, README de lancement
- [ ] **T21** (CR) Revue code & sécurité, corrections appliquées
- [ ] **T22** Validation finale : VALIDATION.md (preuve par fonctionnalité), RAPPORT.md
