# VALIDATION — état au 14/11/2026

Verdict : **pas encore prêt pour la production.** Le cœur du produit (collecte → matching → digest → espace
entreprise) est fonctionnel et prouvé par des tests. Restent les écrans d'administration, les pages légales et
quelques points listés en fin de document.

## Résultats des vérifications

| Vérification | Commande | Résultat |
|---|---|---|
| Lint + types | `pnpm lint` | ✅ |
| Unitaires API | `pnpm test:api` | ✅ 43/43 |
| Unitaires web | `pnpm test:web` | ✅ 46/46 |
| Collecteur | `pnpm test:collector` | ✅ 57/57, ruff propre |
| e2e API | `pnpm test:e2e:api` | ✅ 59/59 (8 suites) |
| Playwright | `pnpm test:e2e` | ⚠️ 12/14 — 2 échecs : pages légales absentes (T17b) |
| Builds | `pnpm build` | ✅ |
| CI GitHub Actions | `.github/workflows/ci.yml` | ⚠️ exécutée sur GitHub : toutes les étapes vertes sauf Playwright (mêmes 2 échecs, pages légales) |

## Preuve par fonctionnalité

| Fonctionnalité | Preuve |
|---|---|
| Inscription, vérification e-mail, connexion, 403 non vérifié | `apps/api/test/auth.e2e-spec.ts`, `e2e/journey.spec.ts` étape 1 |
| Jetons à usage unique, Argon2id, rotation et détection de réutilisation du refresh | `auth.e2e-spec.ts`, `auth.service.ts` |
| Profil entreprise, rôles (MEMBER 403), invitation, dernier admin protégé | `company.e2e-spec.ts`, Playwright étape 2 |
| Préférences de veille (validation, CRUD, rematch immédiat) | `preferences.e2e-spec.ts`, Playwright étape 2 |
| **Isolation multi-tenant** : 404 inter-entreprise, état saved/match/notifications cloisonné, `companyId` client ignoré | `isolation.e2e-spec.ts` (8 tests) |
| Annonces : filtres, recherche (LIKE échappé), tri, pagination | `tenders.e2e-spec.ts` |
| **Date limite sans heure ouverte toute la journée (D27)** | `matching.service.spec.ts`, `tenders.e2e-spec.ts` |
| **Jamais d'invention** : champs absents = `null`, affichés « Non précisé » (fiche et e-mail) | `tenders.e2e-spec.ts`, `pipeline.e2e-spec.ts`, Playwright étape 5 |
| Source officielle, pages et URL conservées | `tenders.e2e-spec.ts`, Playwright étape 4 (`official-link`) |
| Favoris, statut de suivi, note interne (persistés) | `tenders.e2e-spec.ts`, Playwright étape 4 |
| **Pipeline idempotent** : 2 lancements = 1 job, 1 notification, 1 e-mail | `pipeline.e2e-spec.ts` |
| **Échec de collecte jamais présenté comme « aucune annonce »** | `pipeline.e2e-spec.ts` (fail + crash), tableau de bord `lastOutcome: FAILED` |
| Relance admin (`:retry-n`), cron sans relance automatique d'un échec | `pipeline.e2e-spec.ts`, `admin.e2e-spec.ts` |
| Administration API : 401/403 sur 14 routes, suspension + audit, sources | `admin.e2e-spec.ts` |
| Collecteur DGCMEF : 10 avis sur le n°4514, pieds de page retirés, idempotence | `services/collector/tests/` |
| Historique des alertes | Playwright étape 6 |
| Interface en français, mobile sans défilement horizontal, garde de routes | `e2e/smoke.spec.ts` (desktop + Pixel 7) |

## Sécurité (T21)

Vérifié et correct : cookies `httpOnly` + `SameSite=Lax` (+ `Secure` en production), JWT HS256 15 min, helmet
sur l'API, SQL brut paramétré uniquement (`Prisma.sql`), toutes les entrées validées par Zod (`.strict()`),
échappement HTML dans tous les e-mails, redirection `next` limitée aux chemins internes, rate-limit sur
l'authentification, mot de passe oublié silencieux (pas d'énumération), aucun secret dans l'historique Git.

Corrigé dans cette revue :
- nodemailer 7 → 10 (14 avis, dont 4 élevés) ; envoi SMTP revérifié sur un serveur SMTP local ;
- override `multer >= 2.5.0` (déni de service) ;
- en-têtes de sécurité sur le web (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy,
  HSTS en production), testés par Playwright.

Restant (`pnpm audit --prod` : 4 avis) :
- **zod 3 (API)** : épuisement mémoire sur des collections surdimensionnées. Atténué par la limite de corps
  JSON d'Express (100 ko) ; correction = migration vers zod 4 (changement majeur, à planifier).
- deepmerge-ts (outillage Prisma), minimatch/deepmerge (CLI shadcn) : hors chemin d'exécution.
- Inscription : `409 EMAIL_TAKEN` révèle qu'une adresse a un compte (compromis UX courant, à arbitrer).
- Pas de Content-Security-Policy sur le web (nécessite un nonce pour les scripts inline de Next).

## Bloquant avant mise en production

1. **T17 — écrans d'administration** : `apps/web/src/app/admin` n'affiche qu'un titre. Toutes les routes API
   existent et sont testées ; il manque l'interface (statistiques, entreprises, sources et relance,
   historique des collectes, notifications).
2. **T17b — pages légales** : `/mentions-legales` et `/confidentialite` répondent 404 (dossiers vides).
   Leur contenu (éditeur, adresse, RCCM/IFU, hébergeur, traitement des données) doit être fourni : il ne
   sera pas inventé.
3. **Collecte réelle non éprouvée en continu** : aucune exécution quotidienne sur le site DGCMEF en conditions
   réelles n'a encore été observée.

## Améliorations recommandées

- Matching : les pluriels ne sont pas gérés (« forage » ne trouve pas « forages »).
- Fiche détaillée : badge « Nouveau » affiché deux fois (statut de l'annonce + correspondance récente).
