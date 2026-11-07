"""Interface en ligne de commande : `python -m collector <commande>` (depuis services/collector)."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from datetime import date
from pathlib import Path

from collector.config import get_settings


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s : %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"identifiant de job invalide : {value}") from exc


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"date attendue au format YYYY-MM-DD : {value}") from exc


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m collector", description="Collecteur SRC Digital")
    p.add_argument("-v", "--verbose", action="store_true", help="journalisation détaillée")
    sub = p.add_subparsers(dest="command", required=True)

    rj = sub.add_parser("run-job", help="traite un job COLLECT (code retour 0 succès / 1 échec)")
    rj.add_argument("job_id", type=_uuid)

    wk = sub.add_parser("worker", help="traite les jobs PENDING en boucle")
    wk.add_argument("--once", action="store_true", help="traite au plus un job puis s'arrête")
    wk.add_argument("--poll-seconds", type=float, default=30.0)

    ing = sub.add_parser("ingest", help="ingestion manuelle d'un PDF local")
    ing.add_argument("pdf", type=Path)
    ing.add_argument("--source", required=True)
    ing.add_argument("--ref", required=True, help='ex. "Quotidien n°4514"')
    ing.add_argument("--date", type=_date, default=None, help="date de publication YYYY-MM-DD")
    ing.add_argument("--url", required=True, help="URL officielle du PDF")
    ing.add_argument("--page-url", default=None)

    dc = sub.add_parser("discover", help="liste les publications trouvées (sans écrire en base)")
    dc.add_argument("--source", required=True)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    log = logging.getLogger("collector")
    settings = get_settings()

    if args.command == "discover":
        from collector.connectors import get_connector

        try:
            connector = get_connector(args.source, settings)
            try:
                pubs = connector.discover()
            finally:
                connector.close()
        except Exception as exc:  # noqa: BLE001 - message lisible, code retour 1
            log.error("découverte impossible : %s : %s", exc.__class__.__name__, exc)
            return 1
        json.dump([p.to_dict() for p in pubs], sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    from collector import pipeline

    if args.command == "run-job":
        return pipeline.run_job(args.job_id, settings)
    if args.command == "worker":
        return pipeline.run_worker(once=args.once, poll_seconds=args.poll_seconds, settings=settings)
    if args.command == "ingest":
        return pipeline.ingest_pdf(
            args.pdf, args.source, args.ref, args.date, args.url, args.page_url, settings
        )
    return 2
