"""Extraction via l'API OpenAI Responses (Structured Outputs, json_schema strict) — D14.

Garde-fous : validation pydantic, puis toute date limite, montant ou référence renvoyés par le
modèle mais introuvables dans le texte source sont remis à None et signalés. En cas d'erreur
(réseau, timeout, HTTP ≠ 200, JSON invalide, schéma non respecté) → repli sur l'extracteur à règles.
"""

from __future__ import annotations

import copy
import json
import logging
import re
from datetime import date
from typing import Any

import httpx
from pydantic import ValidationError

from collector.config import Settings
from collector.connectors.dgcmef import FRENCH_MONTHS
from collector.extract.base import ExtractionOutcome, Extractor
from collector.extract.rules import RulesExtractor
from collector.extract.schema import TenderExtraction
from collector.segment import Notice
from collector.taxonomy import extraction_json_schema, procedure_types, sector_codes
from collector.text import fold

log = logging.getLogger(__name__)

RESPONSES_URL = "https://api.openai.com/v1/responses"

SYSTEM_PROMPT = (
    "Tu es un assistant d'extraction d'informations pour une veille des marchés publics du Burkina Faso. "
    "On te fournit le texte brut d'UN avis publié dans le Quotidien des marchés publics (DGCMEF). "
    "Règles impératives :\n"
    "1. Extrais uniquement ce qui est écrit explicitement dans le texte. Ne déduis rien, n'invente rien.\n"
    "2. Toute information absente ou ambiguë vaut null (ou liste vide) et son nom de champ doit figurer "
    "dans missing_or_uncertain_fields.\n"
    "3. submission_deadline (YYYY-MM-DD) et submission_time (HH:MM) : uniquement la date/heure limite de "
    "dépôt des offres (« avant le », « au plus tard le »), jamais la date d'ouverture des plis.\n"
    "4. estimated_budget : uniquement le montant prévisionnel publié, en FCFA, en entier. Si HTVA et TTC "
    "sont publiés, prends le TTC. Jamais la garantie/caution de soumission ni le coût du dossier. "
    "Plusieurs lots sans total publié : null.\n"
    "5. reference : la référence de l'avis telle qu'écrite (ex. N°2026-012/BYM/DG/PRCP).\n"
    "6. sectors : codes de la taxonomie fournie uniquement ; 'autres' si aucun ne convient.\n"
    "7. summary : 2 phrases maximum, en français, sans aucune information absente du texte.\n"
    "8. evidence : recopie mot pour mot le passage source justifiant chaque champ critique (null si absent)."
)


def _schema_for_api() -> dict[str, Any]:
    schema = copy.deepcopy(extraction_json_schema())
    for key in ("$schema", "title"):
        schema.pop(key, None)
    return schema


def _parse_output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"]
    if payload.get("status") not in (None, "completed"):
        raise ValueError(f"réponse OpenAI non terminée (status={payload.get('status')})")
    for item in payload.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "refusal":
                raise ValueError("le modèle a refusé de répondre")
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                return part["text"]
    raise ValueError("aucun texte de sortie dans la réponse OpenAI")


# ── Garde-fous de présence dans la source ───────────────────────────────────────────────
_MONTH_BY_NUM = {v: k for k, v in FRENCH_MONTHS.items()}


def _digits_joined(text: str) -> str:
    return re.sub(r"(?<=\d)[ .  ](?=\d{3}(?!\d))", "", text)


def amount_in_source(amount: int, source: str) -> bool:
    return re.search(rf"(?<!\d){amount}(?!\d)", _digits_joined(fold(source))) is not None


def date_in_source(iso: str, source: str) -> bool:
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return False
    f = fold(source)
    numeric = rf"(?<!\d)0?{d.day}\s*[/.-]\s*0?{d.month}\s*[/.-]\s*{d.year}(?!\d)"
    textual = rf"(?<!\d)0?{d.day}(?:er)?\s+{_MONTH_BY_NUM[d.month]}\s+{d.year}(?!\d)"
    return re.search(numeric, f) is not None or re.search(textual, f) is not None


def time_in_source(hhmm: str, source: str) -> bool:
    hh, mm = (int(x) for x in hhmm.split(":"))
    f = fold(source)
    minutes = rf"\s*(?:0?{mm}|{mm:02d})" if mm else r"(?:\s*00)?"
    return re.search(rf"(?<!\d)0?{hh}\s*(?:h|heures?|:){minutes}", f) is not None


def _ref_key(text: str) -> str:
    core = re.sub(r"^\s*n\s*[°o]?\s*:?\s*", "", text, flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]", "", fold(core))


def reference_in_source(reference: str, source: str) -> bool:
    key = _ref_key(reference)
    return len(key) >= 4 and key in re.sub(r"[^a-z0-9]", "", fold(source))


def apply_guardrails(data: TenderExtraction, source: str) -> TenderExtraction:
    """Remet à None les valeurs critiques introuvables dans le texte source."""
    d = data.model_dump()
    rejected: list[str] = []
    if d["submission_deadline"] and not date_in_source(d["submission_deadline"], source):
        d["submission_deadline"] = None
        d["evidence"]["submission_deadline"] = None
        rejected.append("submission_deadline")
    if d["submission_time"] and (
        d["submission_deadline"] is None or not time_in_source(d["submission_time"], source)
    ):
        d["submission_time"] = None
        rejected.append("submission_time")
    if d["estimated_budget"] is not None and not amount_in_source(d["estimated_budget"], source):
        d["estimated_budget"] = None
        d["budget_tax_basis"] = None
        d["evidence"]["estimated_budget"] = None
        rejected.append("estimated_budget")
    if d["reference"] and not reference_in_source(d["reference"], source):
        d["reference"] = None
        d["evidence"]["reference"] = None
        rejected.append("reference")
    for name in rejected:
        if name not in d["missing_or_uncertain_fields"]:
            d["missing_or_uncertain_fields"].append(name)
    if rejected:
        log.warning("garde-fous : valeurs absentes de la source rejetées : %s", ", ".join(rejected))
    return TenderExtraction.model_validate(d)


class OpenAIExtractor(Extractor):
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings
        self.model = settings.openai_model
        self.fallback = RulesExtractor()
        self._client = httpx.Client(timeout=settings.openai_timeout_seconds, transport=transport)

    def close(self) -> None:
        self._client.close()

    def _request(self, notice: Notice, publication_date: date | None) -> dict[str, Any]:
        pub = publication_date.isoformat() if publication_date else "inconnue"
        user = (
            f"Date de publication du quotidien : {pub}\n"
            f"Catégorie (rubrique du quotidien) : {notice.category or 'non précisée'}\n"
            f"Codes de secteurs autorisés : {', '.join(sector_codes())}\n"
            f"Types de procédure autorisés : {', '.join(procedure_types())}\n\n"
            f"Texte de l'avis :\n<<<\n{notice.text}\n>>>"
        )
        return {
            "model": self.model,
            "input": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "tender_extraction",
                    "strict": True,
                    "schema": _schema_for_api(),
                }
            },
        }

    def extract(self, notice: Notice, publication_date: date | None = None) -> ExtractionOutcome:
        if not self.settings.openai_api_key:
            log.warning("OPENAI_API_KEY absente : repli sur l'extracteur à règles")
            return self.fallback.extract(notice, publication_date)
        try:
            resp = self._client.post(
                RESPONSES_URL,
                headers={"Authorization": f"Bearer {self.settings.openai_api_key}"},
                json=self._request(notice, publication_date),
            )
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code} de l'API OpenAI")
            raw = json.loads(_parse_output_text(resp.json()))
            data = TenderExtraction.model_validate(raw)
            data = apply_guardrails(data, notice.text)
        except (httpx.HTTPError, RuntimeError, ValueError, ValidationError, json.JSONDecodeError) as exc:
            # Message sans secret : type d'erreur + statut, jamais la clé ni le corps complet.
            log.warning(
                "extraction OpenAI impossible (%s : %s) : repli sur rules:v1",
                exc.__class__.__name__,
                str(exc)[:200],
            )
            return self.fallback.extract(notice, publication_date)
        evidence: dict[str, str | None] = dict(data.evidence.model_dump())
        evidence["title"] = data.title
        return ExtractionOutcome(data=data, model=f"openai:{self.model}", evidence=evidence)
