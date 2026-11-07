from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date

from collector.extract.schema import TenderExtraction
from collector.segment import Notice


@dataclass
class ExtractionOutcome:
    data: TenderExtraction
    model: str  # « rules:v1 » | « openai:<modèle> »
    evidence: dict[str, str | None] = field(default_factory=dict)  # passages source par champ


class Extractor(ABC):
    @abstractmethod
    def extract(self, notice: Notice, publication_date: date | None = None) -> ExtractionOutcome: ...

    def close(self) -> None:  # noqa: B027
        pass
