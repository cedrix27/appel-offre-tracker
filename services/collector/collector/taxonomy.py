"""Référentiels partagés (packages/shared) : taxonomie des secteurs, types de procédure, zones."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from collector.config import SHARED_DIR


@lru_cache(maxsize=1)
def taxonomy() -> dict[str, Any]:
    return json.loads((SHARED_DIR / "taxonomy.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def extraction_json_schema() -> dict[str, Any]:
    return json.loads((SHARED_DIR / "tender-extraction.schema.json").read_text(encoding="utf-8"))


def sector_codes() -> list[str]:
    return [s["code"] for s in taxonomy()["sectors"]]


def procedure_types() -> list[str]:
    return list(taxonomy()["procedureTypes"])


def zones() -> list[str]:
    return list(taxonomy()["zones"])
