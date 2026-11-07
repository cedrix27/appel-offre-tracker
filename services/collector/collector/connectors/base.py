"""Contrat commun des connecteurs."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from datetime import date


class PublicationUnavailable(RuntimeError):
    """Publication listée mais indisponible (ex. PDF absent du dossier de fixtures) : ignorée."""


@dataclass(frozen=True)
class Publication:
    external_ref: str  # ex. « Quotidien n°4514 »
    number: str  # ex. « 4514 »
    title: str
    publication_date: date | None
    page_url: str | None
    file_url: str  # toujours lue dans la page source, jamais construite

    def to_dict(self) -> dict[str, object]:
        d = asdict(self)
        d["publication_date"] = self.publication_date.isoformat() if self.publication_date else None
        return d


@dataclass(frozen=True)
class Download:
    content: bytes
    etag: str | None
    not_modified: bool = False


class Connector(ABC):
    source_type = "HTML_PDF"

    @abstractmethod
    def discover(self) -> list[Publication]:
        """Publications listées par la source, les plus récentes d'abord."""

    @abstractmethod
    def download(self, publication: Publication, etag: str | None = None) -> Download:
        """Télécharge le fichier de la publication (requête conditionnelle si `etag`)."""

    def close(self) -> None:  # noqa: B027 - implémentation par défaut volontairement vide
        pass
