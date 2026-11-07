"""Utilitaires de normalisation de texte (partagés par la segmentation et l'extraction)."""

from __future__ import annotations

import hashlib
import re
import unicodedata

_WS = re.compile(r"\s+")


def compact(text: str) -> str:
    """Espaces (y compris sauts de ligne et insécables) compactés en un seul espace."""
    return _WS.sub(" ", text.replace(" ", " ").replace(" ", " ")).strip()


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def fold(text: str) -> str:
    """Minuscules, sans accents, apostrophes typographiques unifiées, espaces compactés."""
    t = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    return compact(strip_accents(t).lower())


def content_hash(text: str) -> str:
    """SHA-256 du texte normalisé (espaces compactés, minuscules) — clé d'idempotence d'un avis."""
    return hashlib.sha256(compact(text).lower().encode("utf-8")).hexdigest()


def is_upper_heading(line: str, min_letters: int = 4) -> bool:
    letters = [c for c in line if c.isalpha()]
    if len(letters) < min_letters:
        return False
    upper = sum(1 for c in letters if c.isupper())
    return upper / len(letters) >= 0.85
