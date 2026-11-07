"""Configuration : variables d'environnement + fichier `.env` à la racine du dépôt."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

COLLECTOR_DIR = Path(__file__).resolve().parent.parent  # services/collector
REPO_ROOT = COLLECTOR_DIR.parent.parent
SHARED_DIR = REPO_ROOT / "packages" / "shared"

_loaded = False


def load_env() -> None:
    """Charge le `.env` racine sans écraser les variables déjà définies."""
    global _loaded
    if _loaded:
        return
    env_file = REPO_ROOT / ".env"
    if env_file.is_file():
        load_dotenv(env_file, override=False)
    _loaded = True


def clean_database_url(url: str) -> str:
    """Retire les paramètres propres à Prisma (`schema`) que libpq/psycopg refuse."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "schema"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def _resolve_path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (REPO_ROOT / p)


@dataclass(frozen=True)
class Settings:
    database_url: str
    ai_provider: str
    openai_api_key: str | None
    openai_model: str
    user_agent: str
    min_delay_seconds: float
    storage_dir: Path
    offline_fixtures: Path | None
    http_timeout_seconds: float
    openai_timeout_seconds: float


def get_settings() -> Settings:
    load_env()
    db = os.environ.get("DATABASE_URL", "")
    offline = os.environ.get("COLLECTOR_OFFLINE_FIXTURES") or None
    return Settings(
        database_url=clean_database_url(db) if db else "",
        ai_provider=(os.environ.get("AI_PROVIDER") or "mock").strip().lower(),
        openai_api_key=os.environ.get("OPENAI_API_KEY") or None,
        openai_model=os.environ.get("OPENAI_MODEL") or "gpt-5-mini",
        user_agent=os.environ.get("COLLECTOR_USER_AGENT") or "SRC-Digital-Collector/0.1",
        # Plancher de 5 s imposé par les règles du projet (respect des sources).
        min_delay_seconds=max(5.0, float(os.environ.get("COLLECTOR_MIN_DELAY_SECONDS") or 5)),
        storage_dir=_resolve_path(os.environ.get("COLLECTOR_STORAGE_DIR") or "services/collector/data"),
        offline_fixtures=_resolve_path(offline) if offline else None,
        http_timeout_seconds=float(os.environ.get("COLLECTOR_HTTP_TIMEOUT_SECONDS") or 60),
        openai_timeout_seconds=float(os.environ.get("OPENAI_TIMEOUT_SECONDS") or 90),
    )
