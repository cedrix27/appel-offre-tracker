# 03 — Modèle de données et contrats

Conventions : `id uuid`, horodatages `timestamptz` (UTC), noms `snake_case`.
🔒 = table cloisonnée par `company_id` (garde serveur + RLS).

## Comptes et entreprises

| Table | Colonnes principales |
|---|---|
| `users` | id, email (unique, citext), password_hash (argon2id), full_name, role_global (`SUPER_ADMIN` \| `USER`), email_verified_at, status, created_at |
| `companies` | id, legal_name, trade_name, description, main_sector, secondary_sectors text[], skills text[], city, address, regions text[], email, phone, website, status (`ACTIVE` \| `SUSPENDED`) |
| `company_members` 🔒 | id, company_id, user_id, role (`COMPANY_ADMIN` \| `COMPANY_MEMBER`), unique(company_id, user_id) |
| `auth_tokens` | id, user_id, type (`EMAIL_VERIFY` \| `PASSWORD_RESET` \| `REFRESH`), token_hash, expires_at, used_at |
| `watch_preferences` 🔒 | id, company_id, name, sectors text[], keywords_include text[], keywords_exclude text[], procedure_types text[], regions text[], budget_min/max bigint (FCFA), min_score int (0–100), recipients text[], is_active |

## Collecte (globale)

| Table | Colonnes principales |
|---|---|
| `sources` | id, code (`dgcmef`), name, base_url, type (`HTML_PDF`…), access_method, frequency_cron, status, last_success_at, error_rate, notes |
| `collector_jobs` | id, source_id, kind (`COLLECT` \| `EXTRACT`), payload jsonb, status (`PENDING` \| `RUNNING` \| `DONE` \| `FAILED`), attempts, locked_at, idempotency_key (unique), created_at |
| `source_runs` | id, source_id, job_id, started_at, finished_at, outcome (`SUCCESS_NEW` \| `SUCCESS_NONE` \| `FAILED`), items_found, items_new, error_message |
| `source_publications` | id, source_id, external_ref (« Quotidien 4514 »), publication_date, page_url, file_url, sha256, etag, fetched_at, unique(source_id, external_ref) |
| `tenders` | id, publication_id, source_id, content_hash (unique), title, reference, organization, description, categories text[], procedure_type, location, publication_date, submission_deadline timestamptz, estimated_budget_amount bigint, budget_currency, budget_tax_basis (`HT`\|`TTC`), eligibility_requirements jsonb, required_documents jsonb, summary, missing_or_uncertain_fields text[], status (`NEW`\|`UPDATED`\|`CLOSED`\|`CANCELLED`\|`AWARDED`), source_url, source_pages int[], raw_text, evidence jsonb, extraction_model, extracted_at, collected_at, last_verified_at |
| `tender_documents` | id, tender_id, url, storage_key, mime, sha256 |

Tous les champs métier extraits sont **nullable** : absence = `NULL`, affichée « Non précisé ».
`evidence` stocke, pour chaque champ, le passage source justifiant la valeur.

## Données par entreprise 🔒

| Table | Colonnes principales |
|---|---|
| `tender_matches` | id, company_id, tender_id, preference_id, score int, reasons jsonb, matched_keywords text[], unique(company_id, tender_id) |
| `saved_tenders` | id, company_id, tender_id, user_id, is_favorite, status (`TO_REVIEW`\|`INTERESTED`\|`APPLYING`\|`IGNORED`), note |
| `notifications` | id, company_id, kind (`DAILY_DIGEST`), digest_date date, idempotency_key (unique = company_id + digest_date), recipients, tender_ids uuid[], status (`QUEUED`\|`SENT`\|`FAILED`), provider_message_id, error, sent_at |
| `audit_logs` | id, actor_user_id, company_id null, action, target_type, target_id, metadata jsonb, created_at |

## Contrat NestJS ↔ collecteur Python

Communication par la base, sans appel HTTP direct :

1. **NestJS** insère `collector_jobs { kind: COLLECT, source: dgcmef, idempotency_key: "dgcmef:2026-11-05" }`.
2. **Python** prend le job (`FOR UPDATE SKIP LOCKED`), crée un `source_runs`, écrit
   `source_publications` puis `tenders` (`ON CONFLICT (content_hash) DO NOTHING`).
3. **Python** extrait avec OpenAI les avis sans `extracted_at`, valide le JSON avec Pydantic
   (le même schéma que `packages/shared/tender-extraction.schema.json`).
4. **Python** clôt le run → `outcome` + compteurs ; job `DONE` ou `FAILED` (retry ×3, backoff).
5. **NestJS** (poll ou `LISTEN/NOTIFY run_finished`) lance matching puis digest.

Le schéma d'extraction (`packages/shared`) est la seule source de vérité :
JSON Schema généré depuis Zod, consommé par Pydantic côté Python.
