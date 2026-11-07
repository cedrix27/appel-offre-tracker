"""Accès PostgreSQL (psycopg 3). Requêtes SQL paramétrées uniquement.

Noms de tables/colonnes : ceux du schéma Prisma (apps/api/prisma/schema.prisma, @@map/@map).
Prisma génère les UUID côté client et gère `updated_at` lui-même : ici, `id` = uuid4() et
`updated_at` est renseigné explicitement.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

Row = dict[str, Any]


def connect(database_url: str) -> psycopg.Connection[Row]:
    if not database_url:
        raise RuntimeError("DATABASE_URL non défini")
    return psycopg.connect(database_url, autocommit=False, row_factory=dict_row)


def new_id() -> str:
    return str(uuid.uuid4())


# ── Jobs ────────────────────────────────────────────────────────────────────────────────
_CLAIM_SQL = """
UPDATE collector_jobs
   SET status = 'RUNNING'::"JobStatus", attempts = attempts + 1, locked_at = now(),
       last_error = NULL, finished_at = NULL
 WHERE id = (
        SELECT id FROM collector_jobs
         WHERE id = %(id)s
           AND (status IN ('PENDING', 'FAILED', 'DONE')
                OR (status = 'RUNNING' AND locked_at < now() - interval '1 hour'))
         FOR UPDATE SKIP LOCKED)
RETURNING *
"""

_CLAIM_NEXT_SQL = """
UPDATE collector_jobs
   SET status = 'RUNNING'::"JobStatus", attempts = attempts + 1, locked_at = now(),
       last_error = NULL, finished_at = NULL
 WHERE id = (
        SELECT id FROM collector_jobs
         WHERE status = 'PENDING' AND kind = 'COLLECT'
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED)
RETURNING *
"""


def get_job(conn: psycopg.Connection[Row], job_id: str) -> Row | None:
    return conn.execute("SELECT * FROM collector_jobs WHERE id = %s", (job_id,)).fetchone()


def claim_job(conn: psycopg.Connection[Row], job_id: str) -> Row | None:
    """Verrouille et passe en RUNNING un job PENDING (ou FAILED/DONE relancé). None si déjà pris."""
    row = conn.execute(_CLAIM_SQL, {"id": job_id}).fetchone()
    conn.commit()
    return row


def claim_next_job(conn: psycopg.Connection[Row]) -> Row | None:
    row = conn.execute(_CLAIM_NEXT_SQL).fetchone()
    conn.commit()
    return row


def finish_job(conn: psycopg.Connection[Row], job_id: str, ok: bool, last_error: str | None) -> None:
    conn.execute(
        """UPDATE collector_jobs
              SET status = %s::"JobStatus", last_error = %s, finished_at = now(), locked_at = NULL
            WHERE id = %s""",
        ("DONE" if ok else "FAILED", last_error, job_id),
    )
    conn.commit()


# ── Sources & runs ──────────────────────────────────────────────────────────────────────
def get_source(conn: psycopg.Connection[Row], source_id: str) -> Row | None:
    return conn.execute("SELECT * FROM sources WHERE id = %s", (source_id,)).fetchone()


def get_source_by_code(conn: psycopg.Connection[Row], code: str) -> Row | None:
    return conn.execute("SELECT * FROM sources WHERE code = %s", (code,)).fetchone()


def create_run(conn: psycopg.Connection[Row], source_id: str, job_id: str | None) -> str:
    run_id = new_id()
    conn.execute(
        """INSERT INTO source_runs (id, source_id, job_id, started_at, outcome, log)
           VALUES (%s, %s, %s, now(), 'RUNNING'::"RunOutcome", %s)""",
        (run_id, source_id, job_id, Jsonb([])),
    )
    conn.commit()
    return run_id


@dataclass
class RunCounts:
    publications_found: int = 0
    items_found: int = 0
    items_new: int = 0
    items_updated: int = 0


def finish_run(
    conn: psycopg.Connection[Row],
    run_id: str,
    outcome: str,
    counts: RunCounts,
    error_message: str | None,
    log: list[dict[str, Any]],
) -> None:
    conn.execute(
        """UPDATE source_runs
              SET finished_at = now(), outcome = %s::"RunOutcome", publications_found = %s,
                  items_found = %s, items_new = %s, items_updated = %s, error_message = %s, log = %s
            WHERE id = %s""",
        (
            outcome,
            counts.publications_found,
            counts.items_found,
            counts.items_new,
            counts.items_updated,
            error_message,
            Jsonb(log),
            run_id,
        ),
    )
    conn.commit()


def update_source_health(conn: psycopg.Connection[Row], source_id: str, success: bool) -> None:
    """`last_success_at` si succès ; `error_rate` = part des FAILED sur les 20 derniers runs terminés."""
    conn.execute(
        """UPDATE sources s
              SET last_success_at = CASE WHEN %(ok)s THEN now() ELSE s.last_success_at END,
                  error_rate = COALESCE((
                      SELECT avg(CASE WHEN r.outcome = 'FAILED' THEN 1.0 ELSE 0.0 END)
                        FROM (SELECT outcome FROM source_runs
                               WHERE source_id = %(sid)s AND outcome <> 'RUNNING'
                               ORDER BY started_at DESC LIMIT 20) r), 0),
                  updated_at = now()
            WHERE s.id = %(sid)s""",
        {"ok": success, "sid": source_id},
    )
    conn.commit()


# ── Publications ────────────────────────────────────────────────────────────────────────
def get_publication(conn: psycopg.Connection[Row], source_id: str, external_ref: str) -> Row | None:
    return conn.execute(
        "SELECT * FROM source_publications WHERE source_id = %s AND external_ref = %s",
        (source_id, external_ref),
    ).fetchone()


def upsert_publication(
    conn: psycopg.Connection[Row],
    source_id: str,
    external_ref: str,
    title: str | None,
    publication_date: date | None,
    page_url: str | None,
    file_url: str | None,
) -> Row:
    row = conn.execute(
        """INSERT INTO source_publications AS sp
               (id, source_id, external_ref, title, publication_date, page_url, file_url, fetched_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, now())
           ON CONFLICT (source_id, external_ref) DO UPDATE
              SET title = COALESCE(EXCLUDED.title, sp.title),
                  publication_date = COALESCE(EXCLUDED.publication_date, sp.publication_date),
                  page_url = COALESCE(EXCLUDED.page_url, sp.page_url),
                  file_url = COALESCE(EXCLUDED.file_url, sp.file_url)
           RETURNING *""",
        (new_id(), source_id, external_ref, title, publication_date, page_url, file_url),
    ).fetchone()
    assert row is not None
    return row


def mark_publication_parsed(
    conn: psycopg.Connection[Row],
    publication_id: str,
    sha256: str,
    etag: str | None,
    storage_key: str,
    page_count: int,
) -> None:
    conn.execute(
        """UPDATE source_publications
              SET sha256 = %s, etag = %s, storage_key = %s, page_count = %s, fetched_at = now(),
                  parsed_at = now()
            WHERE id = %s""",
        (sha256, etag, storage_key, page_count, publication_id),
    )


def touch_publication(conn: psycopg.Connection[Row], publication_id: str) -> None:
    conn.execute("UPDATE source_publications SET fetched_at = now() WHERE id = %s", (publication_id,))


# ── Annonces ────────────────────────────────────────────────────────────────────────────
TENDER_FIELDS = (
    "title",
    "reference",
    "organization",
    "description",
    "categories",
    "sectors",
    "procedure_type",
    "location",
    "publication_date",
    "submission_deadline",
    "deadline_has_time",
    "estimated_budget",
    "budget_tax_basis",
    "funding_source",
    "eligibility_requirements",
    "required_documents",
    "summary",
    "missing_or_uncertain_fields",
)
_JSON_FIELDS = {"eligibility_requirements", "required_documents", "evidence"}
_CASTS = {
    "source_pages": "::int[]",
    "categories": "::text[]",
    "sectors": "::text[]",
    "missing_or_uncertain_fields": "::text[]",
}


def _param(name: str, value: Any) -> Any:
    return Jsonb(value) if name in _JSON_FIELDS else value


def upsert_tender(conn: psycopg.Connection[Row], values: dict[str, Any], now: datetime) -> tuple[str, str]:
    """Insère l'annonce (clé : content_hash). Retourne (id, « new » | « updated » | « unchanged »).

    Annonce existante : `last_verified_at` mis à jour ; champs extraits réécrits seulement s'ils
    ont changé (et jamais une extraction OpenAI remplacée par un repli à règles)."""
    cols = [
        "id",
        "source_id",
        "publication_id",
        "content_hash",
        *TENDER_FIELDS,
        "status",
        "source_url",
        "source_pages",
        "raw_text",
        "evidence",
        "extraction_model",
        "extracted_at",
        "collected_at",
        "last_verified_at",
        "created_at",
        "updated_at",
    ]
    row_values = {
        **values,
        "id": new_id(),
        "status": "NEW",
        "collected_at": now,
        "last_verified_at": now,
        "created_at": now,
        "updated_at": now,
    }
    placeholders = []
    for c in cols:
        if c == "status":
            placeholders.append('%(status)s::"TenderStatus"')
        else:
            placeholders.append(f"%({c})s{_CASTS.get(c, '')}")
    params = {c: _param(c, row_values[c]) for c in cols}
    inserted = conn.execute(
        f"INSERT INTO tenders ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) "  # noqa: S608
        "ON CONFLICT (content_hash) DO NOTHING RETURNING id",
        params,
    ).fetchone()
    if inserted:
        return inserted["id"], "new"

    existing = conn.execute(
        f"SELECT id, extraction_model, {', '.join(TENDER_FIELDS)} FROM tenders "  # noqa: S608
        "WHERE content_hash = %s",
        (values["content_hash"],),
    ).fetchone()
    assert existing is not None
    tender_id = str(existing["id"])
    downgrade = str(existing.get("extraction_model") or "").startswith("openai:") and str(
        values.get("extraction_model") or ""
    ).startswith("rules:")
    changed = [f for f in TENDER_FIELDS if _normalize(existing[f]) != _normalize(values[f])]
    if changed and not downgrade:
        sets = ", ".join(
            f"{c} = %({c})s{_CASTS.get(c, '')}"
            for c in [*TENDER_FIELDS, "evidence", "extraction_model", "extracted_at"]
        )
        params = {
            c: _param(c, values[c]) for c in [*TENDER_FIELDS, "evidence", "extraction_model", "extracted_at"]
        }
        params.update({"id": tender_id, "now": now})
        conn.execute(
            f"UPDATE tenders SET {sets}, last_verified_at = %(now)s, updated_at = %(now)s "  # noqa: S608
            "WHERE id = %(id)s",
            params,
        )
        return tender_id, "updated"
    conn.execute(
        "UPDATE tenders SET last_verified_at = %s, updated_at = %s WHERE id = %s", (now, now, tender_id)
    )
    return tender_id, "unchanged"


def _normalize(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.timestamp()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, list | tuple):
        return [_normalize(x) for x in v]
    return v


def add_tender_document(
    conn: psycopg.Connection[Row],
    tender_id: str,
    label: str,
    url: str,
    storage_key: str | None,
    sha256: str | None,
) -> None:
    conn.execute(
        """INSERT INTO tender_documents (id, tender_id, label, url, storage_key, mime, sha256, created_at)
           VALUES (%s, %s, %s, %s, %s, 'application/pdf', %s, now())
           ON CONFLICT (tender_id, url) DO NOTHING""",
        (new_id(), tender_id, label, url, storage_key, sha256),
    )
