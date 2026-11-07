"""Connecteurs de sources. Registre : code de source → classe de connecteur."""

from __future__ import annotations

from collector.config import Settings
from collector.connectors.base import Connector, Publication, PublicationUnavailable
from collector.connectors.dgcmef import DgcmefConnector

__all__ = ["Connector", "Publication", "PublicationUnavailable", "get_connector"]


def get_connector(source_code: str, settings: Settings, **kwargs: object) -> Connector:
    """Retourne le connecteur d'une source. Les codes `dgcmef` et `dgcmef-<suffixe>` (instances de
    test isolées) utilisent le connecteur DGCMEF."""
    code = source_code.lower()
    if code == "dgcmef" or code.startswith("dgcmef-"):
        return DgcmefConnector(settings, **kwargs)  # type: ignore[arg-type]
    raise ValueError(f"aucun connecteur pour la source « {source_code} »")
