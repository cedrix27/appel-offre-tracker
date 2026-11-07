from __future__ import annotations

from dataclasses import replace
from datetime import date

import httpx
import pytest

from collector.config import get_settings
from collector.connectors import PublicationUnavailable, get_connector
from collector.connectors.dgcmef import (
    DgcmefConnector,
    normalize_ref,
    parse_french_date,
    parse_listing,
    parse_node_pdf,
)
from collector.http import PoliteClient
from tests.conftest import FIXTURES


def test_parse_listing_finds_10_publications():
    pubs = parse_listing((FIXTURES / "dgcmef_appels_d_offre.html").read_text(encoding="utf-8"))
    assert len(pubs) == 10
    first = pubs[0]
    assert first.external_ref == "Quotidien n°4514"
    assert first.title == "Quotidien n° 4514 – Mercredi 21 octobre 2026"
    assert first.publication_date == date(2026, 10, 21)
    assert first.page_url == "https://www.dgcmef.gov.bf/index.php/fr/node/2466"
    assert (
        first.file_url == "http://www.dgcmef.gov.bf/sites/default/files/2026-10/Quotidien%20n%C2%B04514.pdf"
    )
    # noms de fichiers irréguliers lus tels quels (N° majuscule, espace avant .pdf)
    p4512 = next(p for p in pubs if p.number == "4512")
    assert p4512.file_url.endswith("Quotidien%20N%C2%B04512%20.pdf")
    assert [p.number for p in pubs] == [str(n) for n in range(4514, 4504, -1)]
    assert all(p.publication_date for p in pubs)


def test_parse_node_page_pdf():
    html = (FIXTURES / "dgcmef_node_2466.html").read_text(encoding="utf-8")
    assert parse_node_pdf(html).endswith("Quotidien%20n%C2%B04514.pdf")


@pytest.mark.parametrize(
    ("title", "ref"),
    [
        ("Quotidien n° 4514 – Mercredi 21 octobre 2026", "Quotidien n°4514"),
        ("Quotidien N°4513 - Mardi 20 octobre 2026 ", "Quotidien n°4513"),
        ("Quotidien n°4106(bis) – Vendredi 28 mars 2025", "Quotidien n°4106 bis"),
    ],
)
def test_normalize_ref(title, ref):
    assert normalize_ref(title)[0] == ref


def test_parse_french_date():
    assert parse_french_date("Vendredi 09 octobre 2026") == date(2026, 10, 9)
    assert parse_french_date("1er décembre 2026") == date(2026, 12, 1)
    assert parse_french_date("Lundi 31 février 2026") is None
    assert parse_french_date("sans date") is None


def test_offline_connector(monkeypatch):
    monkeypatch.setenv("COLLECTOR_OFFLINE_FIXTURES", str(FIXTURES))
    conn = get_connector("dgcmef", get_settings())
    pubs = conn.discover()
    assert len(pubs) == 10
    dl = conn.download(pubs[0])
    assert dl.content.startswith(b"%PDF")
    with pytest.raises(PublicationUnavailable):
        conn.download(pubs[1])  # n°4513 absent du dossier : ignoré, pas une erreur fatale
    with pytest.raises(RuntimeError):
        _ = conn.client  # aucun réseau en mode hors-ligne


def test_online_connector_with_mock_transport(monkeypatch):
    monkeypatch.delenv("COLLECTOR_OFFLINE_FIXTURES", raising=False)
    listing = (FIXTURES / "dgcmef_appels_d_offre.html").read_bytes()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /admin/\n")
        if request.url.path == "/index.php/fr/appels-d-offre":
            return httpx.Response(200, content=listing)
        if request.url.path.endswith(".pdf"):
            if request.headers.get("if-none-match") == '"abc"':
                return httpx.Response(304)
            return httpx.Response(200, content=b"%PDF-1.7 ...", headers={"ETag": '"abc"'})
        return httpx.Response(404)

    sleeps: list[float] = []
    client = PoliteClient(
        "SRC-Test/1.0", min_delay_seconds=5, transport=httpx.MockTransport(handler), sleep=sleeps.append
    )
    settings = replace(get_settings(), offline_fixtures=None)
    conn = DgcmefConnector(settings, client=client)
    pubs = conn.discover()
    assert len(pubs) == 10
    dl = conn.download(pubs[0])
    assert dl.etag == '"abc"' and dl.content.startswith(b"%PDF")
    again = conn.download(pubs[0], etag=dl.etag)
    assert again.not_modified
    assert all(r.headers["user-agent"] == "SRC-Test/1.0" for r in seen)
    assert sleeps, "le délai minimal entre requêtes doit être appliqué"
