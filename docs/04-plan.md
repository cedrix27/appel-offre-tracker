# 04 — Plan par petites étapes

Chaque étape laisse une application exécutable + tests. Aligné sur le planning §11.

| # | Étape | Livrable vérifiable | Semaine |
|---|---|---|---|
| 0 | Cadrage (ce dossier) | Docs 01–05 validés | 2–6 nov |
| 1 | Socle monorepo | `git init`, pnpm workspaces, lint/format, `.env.example`, Postgres + Redis locaux, CI simple | 9 nov |
| 2 | **Prototype connecteur DGCMEF** (Python) | `collector discover` liste les quotidiens ; `collector parse <pdf>` sort les avis en JSON ; tests sur un quotidien de référence | 9–10 nov |
| 3 | API : schéma Prisma + migrations | Tables §03, seed `sources`, tests de migration | 10–11 nov |
| 4 | API : auth (register, vérif e-mail, login, reset) | Tests e2e Supertest, Argon2id, rate-limit | 11–12 nov |
| 5 | API : entreprise, membres, préférences | Tests **d'isolation A/B** dès cette étape | 12–13 nov |
| 6 | Web : site public + auth + onboarding | Pages FR, design system appliqué | 13 nov |
| 7 | Collecteur complet : jobs, runs, dédup, stockage | Relance = 0 doublon (test) | 16–20 nov |
| 8 | Extraction OpenAI + validation | Jeu de 20 avis annotés à la main, taux de champs corrects mesuré, aucun champ inventé | 23–25 nov |
| 9 | Matching + score + justification | Tests unitaires sur cas types | 25–27 nov |
| 10 | Scheduler + digest e-mail idempotent | Redémarrage worker = pas de double envoi (test) | 30 nov–2 déc |
| 11 | Dashboard entreprise + admin | Filtres, favoris, statuts, historique collectes | 2–4 déc |
| 12 | Sécurité, RLS, tests multi-tenant, délivrabilité | Checklist §9 | 7–11 déc |
| 13 | Pilote | Déploiement + 3 entreprises pilotes | 14–18 déc |

**Prochaine action proposée :** étapes 1 et 2 (socle + prototype DGCMEF), car le
connecteur est le principal risque du projet.
