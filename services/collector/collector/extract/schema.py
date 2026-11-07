"""Modèle pydantic aligné sur packages/shared/tender-extraction.schema.json."""

from __future__ import annotations

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from collector.taxonomy import procedure_types, sector_codes

_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference: str | None
    organization: str | None
    submission_deadline: str | None
    estimated_budget: str | None


class TenderExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    reference: str | None
    organization: str | None
    description: str | None
    categories: list[str]
    sectors: list[str]
    procedure_type: str | None
    location: str | None
    publication_date: str | None
    submission_deadline: str | None
    submission_time: str | None
    estimated_budget: int | None = Field(ge=0)
    budget_tax_basis: str | None
    funding_source: str | None
    eligibility_requirements: list[str]
    required_documents: list[str]
    summary: str
    missing_or_uncertain_fields: list[str]
    evidence: Evidence

    @field_validator("sectors")
    @classmethod
    def _sectors(cls, v: list[str]) -> list[str]:
        allowed = set(sector_codes())
        bad = [s for s in v if s not in allowed]
        if bad:
            raise ValueError(f"secteurs hors taxonomie : {bad}")
        return list(dict.fromkeys(v))

    @field_validator("procedure_type")
    @classmethod
    def _procedure(cls, v: str | None) -> str | None:
        if v is not None and v not in procedure_types():
            raise ValueError(f"type de procédure inconnu : {v}")
        return v

    @field_validator("budget_tax_basis")
    @classmethod
    def _basis(cls, v: str | None) -> str | None:
        if v is not None and v not in ("HT", "HTVA", "TTC"):
            raise ValueError(f"base fiscale inconnue : {v}")
        return v

    @field_validator("publication_date", "submission_deadline")
    @classmethod
    def _iso_date(cls, v: str | None) -> str | None:
        if v is None:
            return None
        date.fromisoformat(v)  # lève ValueError si invalide
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("date attendue au format YYYY-MM-DD")
        return v

    @field_validator("submission_time")
    @classmethod
    def _time(cls, v: str | None) -> str | None:
        if v is not None and not _TIME.match(v):
            raise ValueError("heure attendue au format HH:MM")
        return v
