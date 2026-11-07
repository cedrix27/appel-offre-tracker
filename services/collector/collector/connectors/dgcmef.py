"""Connecteur DGCMEF : page liste des quotidiens → PDF du Quotidien des marchés publics.

Audit : docs/02-audit-sources.md. Page liste : 10 derniers quotidiens (table Drupal), chaque
ligne contient le lien vers le nœud et le lien PDF. Les noms de fichiers sont irréguliers :
l'URL du PDF est toujours lue dans la page.

Mode hors-ligne (COLLECTOR_OFFLINE_FIXTURES=<dossier>) : la page liste est lue depuis
`<dossier>/dgcmef_appels_d_offre.html` et les PDF depuis `<dossier>/quotidien_<numéro>.pdf`.
Aucun accès réseau.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin

from collector.config import Settings
from collector.connectors.base import Connector, Download, Publication, PublicationUnavailable
from collector.http import PoliteClient
from collector.text import compact, fold

log = logging.getLogger(__name__)

BASE_URL = "https://www.dgcmef.gov.bf"
LIST_URL = f"{BASE_URL}/index.php/fr/appels-d-offre"
LIST_FIXTURE = "dgcmef_appels_d_offre.html"

FRENCH_MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}
_DATE_RX = re.compile(r"\b(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})\b")
_NUMBER_RX = re.compile(r"quotidien\s+n\s*[°o]\s*(\d{3,6})\s*(\(?\s*bis\s*\)?)?", re.IGNORECASE)


def parse_french_date(text: str) -> date | None:
    """« Mercredi 21 octobre 2026 » → date(2026, 10, 21). None si absente ou invalide."""
    for day, month, year in _DATE_RX.findall(fold(text)):
        m = FRENCH_MONTHS.get(month)
        if not m:
            continue
        try:
            return date(int(year), m, int(day))
        except ValueError:
            return None
    return None


def normalize_ref(title: str) -> tuple[str, str] | None:
    """« Quotidien n° 4514 – Mercredi… » → (« Quotidien n°4514 », « 4514 »)."""
    m = _NUMBER_RX.search(title.replace("º", "°"))
    if not m:
        return None
    number = m.group(1)
    suffix = " bis" if m.group(2) else ""
    return f"Quotidien n°{number}{suffix}", number + ("bis" if suffix else "")


class _RowParser(HTMLParser):
    """Collecte, par ligne de tableau <tr>, les liens (href, texte)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[tuple[str, str]]] = []
        self._row: list[tuple[str, str]] | None = None
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag == "a" and self._row is not None:
            self._href = dict(attrs).get("href") or ""
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None and self._row is not None:
            self._row.append((self._href, compact("".join(self._text))))
            self._href = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None


class _FileFieldParser(HTMLParser):
    """Lit le premier lien PDF d'une page de nœud (champ « Fichier »)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pdf: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a" or self.pdf:
            return
        a = dict(attrs)
        href = a.get("href") or ""
        if (a.get("type") == "application/pdf") or unquote(href).strip().lower().endswith(".pdf"):
            self.pdf = href


def _is_pdf_link(href: str) -> bool:
    return unquote(href).strip().lower().endswith(".pdf")


def parse_listing(html: str, base_url: str = BASE_URL) -> list[Publication]:
    """Publications de la page liste, dans l'ordre de la page (la plus récente d'abord).
    Les lignes sans lien PDF sont conservées avec file_url vide (résolu via la page du nœud)."""
    parser = _RowParser()
    parser.feed(html)
    pubs: list[Publication] = []
    seen: set[str] = set()
    for row in parser.rows:
        node = next(((h, t) for h, t in row if "/node/" in h and t), None)
        pdf = next((h for h, _ in row if _is_pdf_link(h)), None)
        if not node:
            continue
        title = node[1]
        ref = normalize_ref(title)
        if not ref:
            continue
        external_ref, number = ref
        if external_ref in seen:
            continue
        seen.add(external_ref)
        pubs.append(
            Publication(
                external_ref=external_ref,
                number=number,
                title=title,
                publication_date=parse_french_date(title),
                page_url=urljoin(base_url, node[0]),
                file_url=urljoin(base_url, pdf) if pdf else "",
            )
        )
    return pubs


def parse_node_pdf(html: str, base_url: str = BASE_URL) -> str | None:
    p = _FileFieldParser()
    p.feed(html)
    return urljoin(base_url, p.pdf) if p.pdf else None


class DgcmefConnector(Connector):
    def __init__(self, settings: Settings, client: PoliteClient | None = None) -> None:
        self.settings = settings
        self.offline: Path | None = settings.offline_fixtures
        self._client = client
        self._owns_client = client is None

    # -- accès ---------------------------------------------------------------
    @property
    def client(self) -> PoliteClient:
        if self.offline is not None:
            raise RuntimeError("mode hors-ligne : aucun accès réseau autorisé")
        if self._client is None:
            self._client = PoliteClient(
                self.settings.user_agent,
                min_delay_seconds=self.settings.min_delay_seconds,
                timeout_seconds=self.settings.http_timeout_seconds,
            )
        return self._client

    def close(self) -> None:
        if self._client is not None and self._owns_client:
            self._client.close()
            self._client = None

    # -- contrat ---------------------------------------------------------------
    def discover(self) -> list[Publication]:
        if self.offline is not None:
            listing = self.offline / LIST_FIXTURE
            if not listing.is_file():
                raise FileNotFoundError(f"fixture de page liste absente : {listing.name}")
            html = listing.read_text(encoding="utf-8", errors="replace")
        else:
            html = self.client.get(LIST_URL).text
        pubs = parse_listing(html)
        if self.offline is None:
            resolved: list[Publication] = []
            for p in pubs:
                if not p.file_url and p.page_url:
                    pdf = parse_node_pdf(self.client.get(p.page_url).text)
                    if not pdf:
                        log.warning("aucun PDF trouvé sur la page %s : publication ignorée", p.page_url)
                        continue
                    p = Publication(p.external_ref, p.number, p.title, p.publication_date, p.page_url, pdf)
                resolved.append(p)
            pubs = resolved
        else:
            pubs = [p for p in pubs if p.file_url]
        return pubs

    def download(self, publication: Publication, etag: str | None = None) -> Download:
        if self.offline is not None:
            path = self.offline / f"quotidien_{publication.number}.pdf"
            if not path.is_file():
                raise PublicationUnavailable(
                    f"{publication.external_ref} absent du dossier de fixtures ({path.name})"
                )
            return Download(content=path.read_bytes(), etag=None)
        res = self.client.get(publication.file_url, etag=etag)
        if res.not_modified:
            return Download(content=b"", etag=etag, not_modified=True)
        return Download(content=res.content, etag=res.etag)
