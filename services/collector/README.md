# Collecteur SRC Digital (Python 3.12)

Collecte le **Quotidien des marchés publics** de la DGCMEF (page liste → PDF), extrait le texte
(`pdftotext -layout`), segmente la partie « AVIS » en avis, extrait les champs (règles ou OpenAI,
validation pydantic, garde-fous anti-invention) et écrit en base (`collector_jobs`, `source_runs`,
`source_publications`, `tenders`, `tender_documents`) de façon idempotente.

## Installation

```bash
cd services/collector
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
# prérequis système : poppler (pdftotext)
```

## Commandes (depuis `services/collector`)

| Commande | Effet |
|---|---|
| `.venv/bin/python -m collector run-job <job_id>` | Traite un job `COLLECT` (verrou `FOR UPDATE SKIP LOCKED`). Code retour **0** = `SUCCESS_NEW`/`SUCCESS_NONE`, **1** = `FAILED`, job introuvable ou déjà en cours. |
| `.venv/bin/python -m collector worker [--once]` | Traite les jobs `PENDING` (en boucle, ou un seul). |
| `.venv/bin/python -m collector ingest <pdf> --source dgcmef --ref "Quotidien n°4514" --date 2026-10-21 --url <url_pdf>` | Ingestion manuelle d'un PDF local (run sans job). |
| `.venv/bin/python -m collector discover --source dgcmef` | Affiche en JSON les publications trouvées, sans écrire. |

Logs lisibles sur **stderr** ; le journal structuré de chaque run est stocké dans `source_runs.log`.
Payload du job : `{"maxPublications": 3}` (défaut 3, les plus récentes, max 10).

## Variables d'environnement

Lues dans l'environnement puis dans le `.env` de la racine du dépôt (l'environnement prime).

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL (le paramètre Prisma `?schema=public` est retiré automatiquement). |
| `AI_PROVIDER` | `mock` (règles, défaut) ou `openai`. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | API Responses + Structured Outputs. Sans clé ou en cas d'erreur : repli `rules:v1`. |
| `COLLECTOR_USER_AGENT` | User-Agent identifié. |
| `COLLECTOR_MIN_DELAY_SECONDS` | Délai entre requêtes vers un même hôte (plancher 5 s). |
| `COLLECTOR_STORAGE_DIR` | Stockage des PDF : `<dir>/<source>/<sha256>.pdf` (relatif = depuis la racine du dépôt). |
| `COLLECTOR_OFFLINE_FIXTURES` | Mode hors-ligne (voir ci-dessous). |
| `COLLECTOR_HTTP_TIMEOUT_SECONDS`, `OPENAI_TIMEOUT_SECONDS` | Timeouts (60 s / 90 s). |

## Mode hors-ligne (tests, e2e Playwright)

`COLLECTOR_OFFLINE_FIXTURES=<dossier>` : aucun accès réseau. La page liste est lue dans
`<dossier>/dgcmef_appels_d_offre.html`, les PDF dans `<dossier>/quotidien_<numéro>.pdf`
(ex. `quotidien_4514.pdf`). Les quotidiens listés mais absents du dossier sont ignorés (événement
`publication.unavailable`). Un chemin relatif est résolu depuis le répertoire courant s'il y existe,
sinon depuis la racine du dépôt. Exemple : `COLLECTOR_OFFLINE_FIXTURES=services/collector/tests/fixtures`.

## Règles appliquées

- Une valeur non écrite dans l'avis vaut `NULL` et figure dans `missing_or_uncertain_fields`.
- Montant : montant prévisionnel publié uniquement (TTC préféré à HTVA) ; jamais la garantie de
  soumission ni le coût du dossier ; montants par lot sans total publié → `NULL`.
- Date limite : « avant le … » / « au plus tard le … » uniquement (pas la date d'ouverture des plis).
  Heure de Ouagadougou = UTC ; sans heure écrite → minuit UTC et `deadline_has_time = false`.
- OpenAI : date limite, montant ou référence absents du texte source → remis à `NULL`.
- Idempotence : publication = (source, `external_ref`) + SHA-256 du PDF ; avis = `content_hash`
  (SHA-256 du texte normalisé). Relance = 0 doublon, run `SUCCESS_NONE`.
- Toute erreur → run `FAILED` + job `FAILED` (`last_error` sans secret), jamais « aucune annonce ».

## Qualité

```bash
.venv/bin/ruff check .
.venv/bin/pytest          # nécessite TEST_DATABASE_URL (base tender_watch_test migrée)
```
