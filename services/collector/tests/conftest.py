from __future__ import annotations

from pathlib import Path

import pytest

from collector.pdf import extract_pages
from collector.segment import Notice, segment_notices

FIXTURES = Path(__file__).parent / "fixtures"
PDF_4514 = FIXTURES / "quotidien_4514.pdf"


@pytest.fixture(scope="session")
def pages_4514() -> list[str]:
    return extract_pages(PDF_4514)


@pytest.fixture(scope="session")
def notices_4514(pages_4514: list[str]) -> list[Notice]:
    return segment_notices(pages_4514)


def find_notice(notices: list[Notice], needle: str) -> Notice:
    hits = [n for n in notices if needle.lower() in (n.organization or "").lower()]
    assert len(hits) == 1, f"{needle}: {len(hits)} avis trouvés"
    return hits[0]
