"""Tests d'intégration sur la base de test (TEST_DATABASE_URL, tender_watch_test migrée par Prisma).

Isolation : chaque test crée sa propre source `dgcmef-pytest-<id>` (connecteur DGCMEF) et la
supprime à la fin (cascade : jobs, runs, publications, annonces). Aucun TRUNCATE : d'autres
suites peuvent utiliser la même base en parallèle.
"""

from __future__ import annotations

import os
import shutil
import uuid
from dataclasses import replace
from datetime import UTC, datetime

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from collector import pipeline
from collector.config import clean_database_url, get_settings, load_env
from collector.text import content_hash
from tests.conftest import FIXTURES, PDF_4514


@pytest.fixture(scope="module")
def test_db_url() -> str:
    load_env()
    url = os.environ.get("TEST_DATABASE_URL")
    assert url, "TEST_DATABASE_URL doit être défini (base tender_watch_test)"
    return clean_database_url(url)


@pytest.fixture
def conn(test_db_url):
    with psycopg.connect(test_db_url, autocommit=True, row_factory=dict_row) as c:
        yield c


@pytest.fixture
def source(conn, notices_4514):
    hashes = [n.content_hash for n in notices_4514]
    conn.execute("DELETE FROM tenders WHERE content_hash = ANY(%s)", (hashes,))
    sid = str(uuid.uuid4())
    code = f"dgcmef-pytest-{sid[:8]}"
    conn.execute(
        """INSERT INTO sources (id, code, name, base_url, type, access_method, updated_at)
           VALUES (%s, %s, 'DGCMEF (tests)', 'https://www.dgcmef.gov.bf', 'HTML_PDF', 'fixtures', now())""",
        (sid, code),
    )
    yield {"id": sid, "code": code}
    conn.execute("DELETE FROM sources WHERE id = %s", (sid,))


@pytest.fixture
def settings(test_db_url, tmp_path):
    return replace(
        get_settings(),
        database_url=test_db_url,
        offline_fixtures=FIXTURES,
        storage_dir=tmp_path / "storage",
        ai_provider="mock",
    )


def make_job(conn, source_id: str, payload: dict | None = None, status: str = "PENDING") -> str:
    jid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO collector_jobs (id, source_id, kind, payload, status, idempotency_key, locked_at)
           VALUES (%s, %s, 'COLLECT', %s, %s::"JobStatus", %s,
                   CASE WHEN %s = 'RUNNING' THEN now() ELSE NULL END)""",
        (jid, source_id, Jsonb(payload or {"maxPublications": 3}), status, f"pytest:{jid}", status),
    )
    return jid


def last_run(conn, job_id: str) -> dict:
    return conn.execute(
        "SELECT * FROM source_runs WHERE job_id = %s ORDER BY started_at DESC LIMIT 1", (job_id,)
    ).fetchone()


def tenders_of(conn, source_id: str) -> list[dict]:
    return conn.execute(
        "SELECT * FROM tenders WHERE source_id = %s ORDER BY source_pages", (source_id,)
    ).fetchall()


def test_run_job_success_then_idempotent(conn, source, settings):
    job = make_job(conn, source["id"])
    assert pipeline.run_job(job, settings) == 0

    j = conn.execute("SELECT * FROM collector_jobs WHERE id = %s", (job,)).fetchone()
    assert j["status"] == "DONE" and j["attempts"] == 1 and j["finished_at"] and j["last_error"] is None
    run = last_run(conn, job)
    assert run["outcome"] == "SUCCESS_NEW"
    assert (run["publications_found"], run["items_found"], run["items_new"], run["items_updated"]) == (
        1,
        10,
        10,
        0,
    )
    events = [e["event"] for e in run["log"]]
    assert "publication.unavailable" in events  # n°4513 et 4512 absents des fixtures : ignorés
    assert "notice.ignored" in events  # avis de report SONABEL

    pub = conn.execute("SELECT * FROM source_publications WHERE source_id = %s", (source["id"],)).fetchone()
    assert pub["external_ref"] == "Quotidien n°4514"
    assert pub["parsed_at"] and pub["page_count"] == 44 and len(pub["sha256"]) == 64
    assert (settings.storage_dir / pub["storage_key"]).is_file()
    assert pub["storage_key"] == f"{source['code']}/{pub['sha256']}.pdf"

    rows = tenders_of(conn, source["id"])
    assert len(rows) == 10
    assert all(r["status"] == "NEW" and r["extraction_model"] == "rules:v1" for r in rows)
    assert all(r["source_url"].endswith("Quotidien%20n%C2%B04514.pdf") for r in rows)
    assert all(r["raw_text"] and r["evidence"] and r["collected_at"] and r["extracted_at"] for r in rows)
    assert all(str(r["publication_date"]) == "2026-10-21" for r in rows)
    docs = conn.execute(
        "SELECT count(*) AS n FROM tender_documents d JOIN tenders t ON t.id = d.tender_id "
        "WHERE t.source_id = %s",
        (source["id"],),
    ).fetchone()
    assert docs["n"] == 10

    src = conn.execute("SELECT * FROM sources WHERE id = %s", (source["id"],)).fetchone()
    assert src["last_success_at"] is not None and src["error_rate"] == 0

    # Relance du même job puis d'un nouveau job : aucun doublon, SUCCESS_NONE.
    assert pipeline.run_job(job, settings) == 0
    assert last_run(conn, job)["outcome"] == "SUCCESS_NONE"
    assert (
        conn.execute("SELECT attempts FROM collector_jobs WHERE id = %s", (job,)).fetchone()["attempts"] == 2
    )
    job2 = make_job(conn, source["id"])
    assert pipeline.run_job(job2, settings) == 0
    run2 = last_run(conn, job2)
    assert run2["outcome"] == "SUCCESS_NONE" and run2["items_new"] == 0
    assert len(tenders_of(conn, source["id"])) == 10
    assert (
        conn.execute(
            "SELECT count(*) AS n FROM source_publications WHERE source_id = %s", (source["id"],)
        ).fetchone()["n"]
        == 1
    )


def test_reprocessing_same_notices_updates_last_verified(conn, source, settings):
    job = make_job(conn, source["id"])
    assert pipeline.run_job(job, settings) == 0
    before = {r["content_hash"]: r["last_verified_at"] for r in tenders_of(conn, source["id"])}
    # Publication invalidée (ex. nouveau PDF) : les avis identiques ne sont pas recréés.
    conn.execute(
        "UPDATE source_publications SET sha256 = NULL, parsed_at = NULL WHERE source_id = %s", (source["id"],)
    )
    job2 = make_job(conn, source["id"])
    assert pipeline.run_job(job2, settings) == 0
    run = last_run(conn, job2)
    assert (run["outcome"], run["items_found"], run["items_new"]) == ("SUCCESS_NONE", 10, 0)
    after = tenders_of(conn, source["id"])
    assert len(after) == 10
    assert all(r["last_verified_at"] > before[r["content_hash"]] for r in after)


def test_fields_absent_are_null(conn, source, settings, notices_4514):
    assert pipeline.run_job(make_job(conn, source["id"]), settings) == 0
    by_org = {r["organization"]: r for r in tenders_of(conn, source["id"])}
    ami = by_org["MINISTERE DE LA CONSTRUCT DE LA PATRIE"]
    assert ami["estimated_budget"] is None and ami["budget_tax_basis"] is None
    assert "estimated_budget" in ami["missing_or_uncertain_fields"]
    assert ami["source_pages"] == [39, 40]
    assert ami["submission_deadline"] == datetime(2026, 11, 4, 9, 30, tzinfo=UTC)
    assert ami["deadline_has_time"] is True

    bym = by_org["BURKINA YIN WISGR META"]
    assert bym["location"] is None
    assert bym["estimated_budget"] == 20_000_000 and bym["budget_tax_basis"] == "TTC"
    assert bym["reference"] == "N°2026-012/BYM/DG/PRCP"
    cegeci = by_org["CENTRE DE GESTION DES CITES"]
    assert cegeci["estimated_budget"] is None

    bumigeb = by_org["BUREAU DES MINES ET DE LA GEOLOGIE DU BURKINA (BUMIGEB)"]
    assert bumigeb["submission_deadline"] == datetime(2026, 10, 30, 9, 0, tzinfo=UTC)
    assert bumigeb["estimated_budget"] == 82_600_000
    assert bumigeb["source_pages"] == [33]
    expected_hash = next(n.content_hash for n in notices_4514 if "BUMIGEB" in (n.organization or ""))
    assert bumigeb["content_hash"] == expected_hash == content_hash(bumigeb["raw_text"])
    assert "avant le le 30/10/2026" in bumigeb["evidence"]["submission_deadline"]


def test_missing_fixture_listing_fails_cleanly(conn, source, settings, tmp_path):
    empty = tmp_path / "vide"
    empty.mkdir()
    job = make_job(conn, source["id"])
    assert pipeline.run_job(job, replace(settings, offline_fixtures=empty)) == 1
    j = conn.execute("SELECT * FROM collector_jobs WHERE id = %s", (job,)).fetchone()
    assert j["status"] == "FAILED" and "fixture" in j["last_error"] and j["finished_at"]
    run = last_run(conn, job)
    assert run["outcome"] == "FAILED" and run["error_message"] and run["finished_at"]
    src = conn.execute("SELECT * FROM sources WHERE id = %s", (source["id"],)).fetchone()
    assert src["last_success_at"] is None and src["error_rate"] == 1.0


@pytest.mark.parametrize("content", [b"ceci n'est pas un PDF", b"%PDF-1.7\n corrompu \x00\x01 sans xref"])
def test_corrupted_pdf_fails_cleanly(conn, source, settings, tmp_path, content):
    folder = tmp_path / "fx"
    folder.mkdir()
    shutil.copy(FIXTURES / "dgcmef_appels_d_offre.html", folder)
    (folder / "quotidien_4514.pdf").write_bytes(content)
    job = make_job(conn, source["id"])
    assert pipeline.run_job(job, replace(settings, offline_fixtures=folder)) == 1
    assert (
        conn.execute("SELECT status FROM collector_jobs WHERE id = %s", (job,)).fetchone()["status"]
        == "FAILED"
    )
    run = last_run(conn, job)
    assert run["outcome"] == "FAILED" and "4514" in run["error_message"]
    assert tenders_of(conn, source["id"]) == []
    pub = conn.execute("SELECT * FROM source_publications WHERE source_id = %s", (source["id"],)).fetchone()
    assert pub is None or pub["parsed_at"] is None
    # Une fois le fichier réparé, le job FAILED relancé réussit.
    shutil.copy(PDF_4514, folder / "quotidien_4514.pdf")
    assert pipeline.run_job(job, replace(settings, offline_fixtures=folder)) == 0
    assert last_run(conn, job)["outcome"] == "SUCCESS_NEW"


def test_running_job_is_not_taken_twice(conn, source, settings):
    job = make_job(conn, source["id"], status="RUNNING")
    assert pipeline.run_job(job, settings) == 1
    j = conn.execute("SELECT * FROM collector_jobs WHERE id = %s", (job,)).fetchone()
    assert j["status"] == "RUNNING" and j["attempts"] == 0
    assert last_run(conn, job) is None
    assert pipeline.run_job(str(uuid.uuid4()), settings) == 1  # job inexistant


def test_worker_once_and_max_publications(conn, source, settings):
    conn.execute(
        "UPDATE collector_jobs SET status = 'DONE' WHERE status = 'PENDING' AND source_id = %s",
        (source["id"],),
    )
    job = make_job(conn, source["id"], payload={"maxPublications": 1})
    # D'autres suites peuvent avoir des jobs PENDING : on traite jusqu'à prendre le nôtre.
    for _ in range(20):
        pipeline.run_worker(once=True, settings=settings)
        if (
            conn.execute("SELECT status FROM collector_jobs WHERE id = %s", (job,)).fetchone()["status"]
            != "PENDING"
        ):
            break
    run = last_run(conn, job)
    assert run["outcome"] == "SUCCESS_NEW" and run["publications_found"] == 1


def test_ingest_manual_pdf(conn, source, settings):
    rc = pipeline.ingest_pdf(
        PDF_4514,
        source["code"],
        "Quotidien n°4514",
        None,
        "https://www.dgcmef.gov.bf/sites/default/files/2026-10/Quotidien%20n%C2%B04514.pdf",
        settings=replace(settings, offline_fixtures=None),
    )
    assert rc == 0
    run = conn.execute("SELECT * FROM source_runs WHERE source_id = %s", (source["id"],)).fetchone()
    assert run["job_id"] is None and run["outcome"] == "SUCCESS_NEW" and run["items_new"] == 10
    assert pipeline.ingest_pdf(PDF_4514, "inconnue", "x", None, "u", settings=settings) == 1


def test_cli_run_job_subprocess(conn, source, test_db_url, tmp_path):
    """Contrat avec l'API : `python -m collector run-job <id>` (cwd services/collector), code retour 0/1."""
    import subprocess
    import sys
    from pathlib import Path

    job = make_job(conn, source["id"])
    env = {
        **os.environ,
        "DATABASE_URL": test_db_url + "?schema=public",  # paramètre Prisma toléré (retiré)
        "COLLECTOR_OFFLINE_FIXTURES": str(FIXTURES),
        "COLLECTOR_STORAGE_DIR": str(tmp_path / "cli-storage"),
        "AI_PROVIDER": "mock",
    }
    cwd = Path(__file__).resolve().parent.parent
    proc = subprocess.run(
        [sys.executable, "-m", "collector", "run-job", job],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert "SUCCESS_NEW" in proc.stderr
    assert last_run(conn, job)["items_new"] == 10
    bad = subprocess.run(
        [sys.executable, "-m", "collector", "run-job", "pas-un-uuid"],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert bad.returncode != 0
