"""Extraction structurée des avis : règles déterministes (mock / repli) ou OpenAI."""

from __future__ import annotations

from collector.config import Settings
from collector.extract.base import ExtractionOutcome, Extractor
from collector.extract.rules import RulesExtractor

__all__ = ["ExtractionOutcome", "Extractor", "RulesExtractor", "get_extractor"]


def get_extractor(settings: Settings) -> Extractor:
    if settings.ai_provider == "openai":
        from collector.extract.openai_extractor import OpenAIExtractor

        return OpenAIExtractor(settings)
    return RulesExtractor()
