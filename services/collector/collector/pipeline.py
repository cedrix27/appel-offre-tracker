"""Traitement d'un job de collecte : verrou → run → publications → avis → annonces.

Idempotence : publication = (source, external_ref) + SHA-256 du PDF (inchangé et déjà analysé →
pas de retraitement) ; avis = `content_hash` (existant → `last_verified_at` seulement).
Une collecte en échec est toujours marquée FAILED, jamais « aucune nouvelle annonce ».
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

import psycopg

from collector import db
from collector.config import Settings, get_settings
from collector.connectors import Connector, Publication, PublicationUnavailable, get_connector
from collector.extract import ExtractionOutcome, Extractor, get_extractor
from collector.pdf import PdfError, extract_pages, looks_like_pdf, sha256_bytes
from collector.segment import segment_notices

log = logging.getLogger("collector.pipeline")

DEFAULT_MAX_PUBLICATIONS = 3
_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(postgres(?:ql)?://[^:/@\s]+):[^@\s]+@"),
    re.compile(r"Bearer\s+\S+", re.IGNORECASE),
]


def scrub(message: str) -> str:
    """Retire tout ce qui ressemble à un secret d'un message d'erreur (clé API, mot de passe d'URL)."""
    out = message
    for rx in _SECRET_PATTERNS:
        out = rx.sub(lambda m: (m.group(1) + ":***@") if m.lastindex else "***", out)
    return out[:1000]


@dataclass
class RunLog:
    events: list[dict[str, Any]] = field(default_factory=list)

    def add(self, level: str, event: str, message: str, **data: Any) -> None:
        entry = {"ts": datetime.now(UTC).isoformat(), "level": level, "event": event, "message": message}
        entry.update({k: v for k, v in data.items() if v is not None})
        self.events.append(entry)
        getattr(log, "warning" if level == "warn" else level)("%s — %s", event, message)


@dataclass
class PublicationResult:
    skipped: bool = False
    items_found: int = 0
    items_new: int = 0
    items_updated: int = 0


def deadline_to_datetime(day: str | None, hhmm: str | None) -> tuple[datetime | None, bool]:
    """Date limite (heure de Ouagadougou = UTC+0) → timestamptz UTC. Sans heure : minuit UTC et
    `deadline_has_time` = False (l'heure n'est jamais inventée)."""
    if not day:
        return None, False
    d = date.fromisoformat(day)
    if hhmm:
        hh, mm = (int(x) for x in hhmm.split(":"))
        return datetime.combine(d, time(hh, mm), tzinfo=UTC), True
    return datetime.combine(d, time(0, 0), tzinfo=UTC), False


def store_pdf(settings: Settings, source_code: str, sha: str, content: bytes) -> str:
    """Conserve le PDF sous COLLECTOR_STORAGE_DIR/<source>/<sha256>.pdf ; retourne la clé relative."""
    key = f"{source_code}/{sha}.pdf"
    target = settings.storage_dir / key
    if target.is_file():
        return key
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=target.parent, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return key


def tender_values(
    outcome: ExtractionOutcome,
    *,
    source_id: str,
    publication_id: str,
    content_hash: str,
    source_url: str,
    pages: list[int],
    raw_text: str,
    publication_date: date | None,
    now: datetime,
) -> dict[str, Any]:
    d = outcome.data
    deadline, has_time = deadline_to_datetime(d.submission_deadline, d.submission_time)
    return {
        "source_id": source_id,
        "publication_id": publication_id,
        "content_hash": content_hash,
        "title": d.title,
        "reference": d.reference,
        "organization": d.organization,
        "description": d.description,
        "categories": d.categories,
        "sectors": d.sectors,
        "procedure_type": d.procedure_type,
        "location": d.location,
        "publication_date": date.fromisoformat(d.publication_date)
        if d.publication_date
        else publication_date,
        "submission_deadline": deadline,
        "deadline_has_time": has_time,
        "estimated_budget": d.estimated_budget,
        "budget_tax_basis": d.budget_tax_basis if d.estimated_budget is not None else None,
        "funding_source": d.funding_source,
        "eligibility_requirements": d.eligibility_requirements,
        "required_documents": d.required_documents,
        "summary": d.summary,
        "missing_or_uncertain_fields": d.missing_or_uncertain_fields,
        "source_url": source_url,
        "source_pages": pages,
        "raw_text": raw_text,
        "evidence": outcome.evidence,
        "extraction_model": outcome.model,
        "extracted_at": now,
    }


class Collector:
    def __init__(
        self,
        conn: psycopg.Connection[db.Row],
        settings: Settings,
        source: db.Row,
        run_id: str,
        runlog: RunLog,
        connector: Connector | None = None,
        extractor: Extractor | None = None,
    ) -> None:
        self.conn = conn
        self.settings = settings
        self.source = source
        self.run_id = run_id
        self.log = runlog
        self.connector = connector or get_connector(source["code"], settings)
        self.extractor = extractor or get_extractor(settings)

    def close(self) -> None:
        self.connector.close()
        self.extractor.close()

    def process_publication(self, pub: Publication, content: bytes | None = None) -> PublicationResult:
        source_id = str(self.source["id"])
        known = db.get_publication(self.conn, source_id, pub.external_ref)
        etag = None
        if content is None:
            # Requête conditionnelle seulement si la publication a déjà été analysée.
            known_etag = known["etag"] if known and known["parsed_at"] else None
            dl = self.connector.download(pub, etag=known_etag)
            if dl.not_modified and known is not None:
                db.touch_publication(self.conn, str(known["id"]))
                self.conn.commit()
                self.log.add("info", "publication.unchanged", f"{pub.external_ref} non modifiée (ETag)")
                return PublicationResult(skipped=True)
            content, etag = dl.content, dl.etag
        row = db.upsert_publication(
            self.conn,
            source_id,
            pub.external_ref,
            pub.title,
            pub.publication_date,
            pub.page_url,
            pub.file_url,
        )
        self.conn.commit()
        pub_id = str(row["id"])
        if not looks_like_pdf(content):
            raise PdfError(f"{pub.external_ref} : le fichier reçu n'est pas un PDF")
        sha = sha256_bytes(content)
        if row["sha256"] == sha and row["parsed_at"] is not None:
            db.touch_publication(self.conn, pub_id)
            self.conn.commit()
            self.log.add(
                "info",
                "publication.unchanged",
                f"{pub.external_ref} déjà analysée (SHA-256 identique)",
                sha256=sha,
            )
            return PublicationResult(skipped=True)

        storage_key = store_pdf(self.settings, self.source["code"], sha, content)
        pages = extract_pages(self.settings.storage_dir / storage_key)
        notices = segment_notices(pages)
        avis = [n for n in notices if n.kind == "avis"]
        for n in notices:
            if n.kind != "avis":
                self.log.add(
                    "info",
                    "notice.ignored",
                    f"{pub.external_ref} p.{n.pages} : avis rectificatif/report non traité au MVP",
                    title=n.title[:200],
                )
        if not avis:
            self.log.add(
                "warn",
                "publication.no_notice",
                f"{pub.external_ref} : aucun avis détecté ({len(pages)} pages)",
            )
        result = PublicationResult(items_found=len(avis))
        now = datetime.now(UTC)
        for n in avis:
            outcome = self.extractor.extract(n, pub.publication_date)
            values = tender_values(
                outcome,
                source_id=source_id,
                publication_id=pub_id,
                content_hash=n.content_hash,
                source_url=pub.file_url,
                pages=n.pages,
                raw_text=n.text,
                publication_date=pub.publication_date,
                now=now,
            )
            tender_id, status = db.upsert_tender(self.conn, values, now)
            db.add_tender_document(
                self.conn,
                tender_id,
                f"{pub.external_ref} (PDF officiel DGCMEF)",
                pub.file_url,
                storage_key,
                sha,
            )
            if status == "new":
                result.items_new += 1
            elif status == "updated":
                result.items_updated += 1
        db.mark_publication_parsed(self.conn, pub_id, sha, etag, storage_key, len(pages))
        self.conn.commit()
        self.log.add(
            "info",
            "publication.parsed",
            f"{pub.external_ref} : {len(avis)} avis, {result.items_new} nouveaux, "
            f"{result.items_updated} mis à jour",
            pages=len(pages),
            sha256=sha,
        )
        return result


def _max_publications(payload: Any) -> int:
    try:
        value = int((payload or {}).get("maxPublications", DEFAULT_MAX_PUBLICATIONS))
    except (TypeError, ValueError, AttributeError):
        return DEFAULT_MAX_PUBLICATIONS
    return max(1, min(value, 10))


def _sort_key(p: Publication) -> tuple[date, str]:
    return (p.publication_date or date.min, p.number)


def execute_collection(
    conn: psycopg.Connection[db.Row],
    settings: Settings,
    source: db.Row,
    job_id: str | None,
    *,
    max_publications: int = DEFAULT_MAX_PUBLICATIONS,
    manual: tuple[Publication, bytes] | None = None,
    connector: Connector | None = None,
    extractor: Extractor | None = None,
) -> tuple[str, db.RunCounts, str | None]:
    """Crée un source_run, collecte, clôture le run. Retourne (outcome, compteurs, erreur)."""
    run_id = db.create_run(conn, str(source["id"]), job_id)
    runlog = RunLog()
    counts = db.RunCounts()
    errors: list[str] = []
    runlog.add(
        "info",
        "run.start",
        f"collecte {source['code']} démarrée",
        run_id=run_id,
        job_id=job_id,
        offline=str(settings.offline_fixtures) if settings.offline_fixtures else None,
        provider=settings.ai_provider,
    )
    collector: Collector | None = None
    try:
        collector = Collector(
            conn, settings, source, run_id, runlog, connector=connector, extractor=extractor
        )
        if manual is not None:
            work: list[tuple[Publication, bytes | None]] = [(manual[0], manual[1])]
        else:
            discovered = sorted(collector.connector.discover(), key=_sort_key, reverse=True)
            runlog.add("info", "discover", f"{len(discovered)} publication(s) listée(s) sur la source")
            if not discovered:
                raise RuntimeError("aucune publication trouvée sur la page liste (structure modifiée ?)")
            work = [(p, None) for p in discovered[:max_publications]]
        for pub, content in work:
            try:
                res = collector.process_publication(pub, content)
            except PublicationUnavailable as exc:
                conn.rollback()
                runlog.add("info", "publication.unavailable", str(exc), ref=pub.external_ref)
                continue
            except Exception as exc:  # noqa: BLE001 - toute erreur de publication est journalisée
                conn.rollback()
                msg = scrub(f"{pub.external_ref} : {exc.__class__.__name__} : {exc}")
                errors.append(msg)
                runlog.add("error", "publication.failed", msg, ref=pub.external_ref)
                continue
            counts.publications_found += 1
            counts.items_found += res.items_found
            counts.items_new += res.items_new
            counts.items_updated += res.items_updated
        if counts.publications_found == 0 and not errors:
            errors.append("aucune publication exploitable (toutes indisponibles)")
    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        msg = scrub(f"{exc.__class__.__name__} : {exc}")
        errors.append(msg)
        runlog.add("error", "run.failed", msg)
    finally:
        if collector is not None:
            collector.close()

    if errors:
        outcome = "FAILED"
        error_message: str | None = " | ".join(errors)[:1000]
    else:
        outcome = "SUCCESS_NEW" if counts.items_new > 0 else "SUCCESS_NONE"
        error_message = None
    runlog.add(
        "info" if not errors else "error",
        "run.end",
        f"résultat {outcome}",
        items_found=counts.items_found,
        items_new=counts.items_new,
        items_updated=counts.items_updated,
        publications=counts.publications_found,
    )
    db.finish_run(conn, run_id, outcome, counts, error_message, runlog.events)
    db.update_source_health(conn, str(source["id"]), outcome != "FAILED")
    return outcome, counts, error_message


def _process_claimed_job(conn: psycopg.Connection[db.Row], settings: Settings, job: db.Row, **kw: Any) -> int:
    job_id = str(job["id"])
    source = db.get_source(conn, str(job["source_id"]))
    if source is None:
        db.finish_job(conn, job_id, False, "source introuvable")
        return 1
    try:
        outcome, _, error = execute_collection(
            conn, settings, source, job_id, max_publications=_max_publications(job.get("payload")), **kw
        )
    except Exception as exc:  # noqa: BLE001 - le job ne doit jamais rester RUNNING
        conn.rollback()
        error = scrub(f"{exc.__class__.__name__} : {exc}")
        log.error("job %s : %s", job_id, error)
        db.finish_job(conn, job_id, False, error)
        return 1
    db.finish_job(conn, job_id, outcome != "FAILED", error)
    log.info("job %s terminé : %s", job_id, outcome)
    return 0 if outcome != "FAILED" else 1


def run_job(job_id: str, settings: Settings | None = None, **kw: Any) -> int:
    """Traite un job COLLECT. Code retour 0 (SUCCESS_NEW / SUCCESS_NONE) ou 1 (FAILED / indisponible)."""
    settings = settings or get_settings()
    with db.connect(settings.database_url) as conn:
        job = db.claim_job(conn, job_id)
        if job is None:
            existing = db.get_job(conn, job_id)
            if existing is None:
                log.error("job %s introuvable", job_id)
            else:
                log.error("job %s déjà en cours (statut %s) : ignoré", job_id, existing["status"])
            return 1
        return _process_claimed_job(conn, settings, job, **kw)


def run_worker(once: bool = False, poll_seconds: float = 30.0, settings: Settings | None = None) -> int:
    """Traite les jobs PENDING (verrou FOR UPDATE SKIP LOCKED). `once` : traite au plus un job."""
    import time as _time

    settings = settings or get_settings()
    status = 0
    with db.connect(settings.database_url) as conn:
        while True:
            job = db.claim_next_job(conn)
            if job is None:
                if once:
                    log.info("aucun job en attente")
                    return status
                _time.sleep(poll_seconds)
                continue
            status = _process_claimed_job(conn, settings, job)
            if once:
                return status


def ingest_pdf(
    pdf_path: Path,
    source_code: str,
    external_ref: str,
    publication_date: date | None,
    file_url: str,
    page_url: str | None = None,
    settings: Settings | None = None,
) -> int:
    """Ingestion manuelle d'un PDF local (crée un source_run sans job)."""
    settings = settings or get_settings()
    content = Path(pdf_path).read_bytes()
    number = re.sub(r"\D", "", external_ref) or external_ref
    pub = Publication(
        external_ref=external_ref,
        number=number,
        title=external_ref,
        publication_date=publication_date,
        page_url=page_url,
        file_url=file_url,
    )
    with db.connect(settings.database_url) as conn:
        source = db.get_source_by_code(conn, source_code)
        if source is None:
            log.error("source « %s » introuvable dans la table sources", source_code)
            return 1
        outcome, counts, _ = execute_collection(conn, settings, source, None, manual=(pub, content))
    log.info("ingestion %s : %s (%d nouveaux)", external_ref, outcome, counts.items_new)
    return 0 if outcome != "FAILED" else 1
