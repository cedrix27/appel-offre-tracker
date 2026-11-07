# DECISIONS — journal des décisions

Format : date · décision · raison. Les décisions validées explicitement par le
client sont marquées ✅ ; les autres sont des hypothèses raisonnables prises en autonomie (🤖).

| # | Date | Décision | Raison |
|---|---|---|---|
| D1 | 2026-11-05 | ✅ Style « papier chaud » de `design-system.md`, thème **rouge / blanc / noir** (boutons noirs et rouges) | Choix client |
| D2 | 2026-11-05 | ✅ Front Next.js 16 + shadcn/ui (Tailwind v4, style base-nova) | Choix client |
| D3 | 2026-11-05 | ✅ NestJS ↔ collecteur Python via Postgres (table `collector_jobs`), pas de Celery | Choix client |
| D4 | 2026-11-05 | ✅ Prisma (ORM + migrations versionnées) | Choix client |
| D5 | 2026-11-05 | ✅ Brevo en production pour l'e-mail | Choix client |
| D6 | 2026-11-05 | ✅ **Pas de Docker** : PostgreSQL 17 Homebrew en local | Choix client |
| D7 | 2026-11-05 | ✅ Conservation des PDF : 24 mois | Choix client |
| D8 | 2026-11-06 | 🤖 **Pas de Redis/BullMQ** : planification par `@nestjs/schedule` (cron) + file de jobs dans Postgres (`collector_jobs`, verrou `FOR UPDATE SKIP LOCKED`, clés d'idempotence) | Redis non installé et refus de Docker ; Postgres suffit au volume MVP (1 source, quelques dizaines d'avis/jour) ; une dépendance de moins |
| D9 | 2026-11-06 | 🤖 L'API lance le collecteur Python en sous-processus (`python -m collector run-job <id>`) puis enchaîne matching → digest. Le collecteur peut aussi tourner seul (`collector worker`) | Pipeline unique, observable, testable de bout en bout sans orchestrateur |
| D10 | 2026-11-06 | 🤖 Versions figées : NestJS 11, Prisma 6.19, Zod 3, Next 16.4, Python 3.12, psycopg 3, pydantic 2 | Majeures stables et bien documentées ; Prisma 7/8 changent la configuration |
| D11 | 2026-11-06 | 🤖 Auth : JWT d'accès (15 min) + refresh token opaque haché en base (30 j), cookies `httpOnly`, `SameSite=Lax`, Argon2id | §6.2 du cahier des charges ; pas de token lisible par JS |
| D12 | 2026-11-06 | 🤖 Le navigateur appelle l'API via un *rewrite* Next (`/api/*` → `API_BASE_URL`) | Même origine → cookies simples, pas de CORS en prod |
| D13 | 2026-11-06 | 🤖 E-mail : interface `MailProvider` avec 3 implémentations : `log` (dev, écrit dans `email_outbox`), `smtp` (nodemailer), `brevo` (API HTTP). Tests = `log` | Pas de vrai envoi hors prod ; e-mails consultables en dev |
| D14 | 2026-11-06 | 🤖 OpenAI : Responses API + Structured Outputs (`json_schema`, strict). `AI_PROVIDER=mock` utilise un extracteur déterministe à base de règles (aussi utilisé comme repli si OpenAI échoue) | Tests reproductibles sans clé ; jamais de champ inventé |
| D15 | 2026-11-06 | 🤖 Matching MVP 100 % déterministe en TypeScript (secteurs, mots-clés, exclusions, régions, budget, type de procédure) ; pas d'embeddings au MVP | §6.7 : la similarité sémantique est « en complément si utile » ; explicable et testable |
| D16 | 2026-11-06 | 🤖 Barème du score (sur 100) : secteur 35, mots-clés 40 (proportionnel, plafonné), région 10, budget 10, procédure 5. Exclusion = rejet. Aucun secteur ni mot-clé correspondant = pas de match | Lisible, justifiable dans l'e-mail |
| D17 | 2026-11-06 | 🤖 Taxonomie contrôlée de 14 secteurs (voir PLAN.md §4) | §6.6 « taxonomie contrôlée » |
| D18 | 2026-11-06 | 🤖 Pas de module de paiement | Non prévu par le cahier des charges |
| D19 | 2026-11-06 | 🤖 Isolation multi-tenant applicative : `company_id` issu du JWT uniquement (jamais de l'URL/du corps), services filtrés, tests e2e A/B. RLS Postgres reportée (V2) | Prisma + RLS complique les migrations ; la garde serveur + tests couvrent l'exigence §7 |
| D20 | 2026-11-06 | 🤖 Next `cacheComponents` désactivé ; pages connectées en composants client qui appellent `/api` | Rendu par utilisateur, moins de pièges de prérendu |
| D21 | 2026-11-06 | 🤖 Fixtures de test : texte extrait des pages 32–44 du Quotidien DGCMEF n°4514 (document public officiel) | Tests réalistes sans dépendre du réseau |
| D22 | 2026-11-06 | 🤖 « Résultats provisoires » (attributions) des quotidiens ignorés au MVP | Hors périmètre §6.5 (statut « attribué » seulement si vérifié) |
| D23 | 2026-11-06 | 🤖 Node 22.11 local : scripts Next avec `NODE_OPTIONS=--experimental-require-module` | `require(esm)` requis par le plugin Tailwind ; à retirer avec Node ≥ 22.12 |
| D24 | 2026-11-06 | 🤖 CI GitHub Actions avec service PostgreSQL ; pas d'image Docker applicative au MVP | D6 ; le déploiement cible sera choisi au pilote |
