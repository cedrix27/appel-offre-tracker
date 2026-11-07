"""Extraction du texte natif d'un PDF, page par page, via `pdftotext` (poppler)."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from pathlib import Path


class PdfError(RuntimeError):
    """PDF illisible, corrompu, ou outil d'extraction indisponible."""


def _pdftotext_bin() -> str:
    found = os.environ.get("PDFTOTEXT_BIN") or shutil.which("pdftotext")
    if found:
        return found
    for candidate in ("/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext", "/usr/bin/pdftotext"):
        if Path(candidate).is_file():
            return candidate
    raise PdfError("pdftotext (poppler) introuvable : installer poppler")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def looks_like_pdf(data: bytes) -> bool:
    return data[:1024].lstrip().startswith(b"%PDF-")


def extract_pages(pdf_path: Path, timeout_seconds: float = 120.0) -> list[str]:
    """Retourne le texte de chaque page (index 0 = page 1), mise en page conservée (`-layout`).

    Aucun shell : arguments passés en liste. Les pages-images renvoient une chaîne vide.
    """
    path = Path(pdf_path)
    if not path.is_file():
        raise PdfError(f"fichier PDF introuvable : {path.name}")
    with path.open("rb") as fh:
        head = fh.read(1024)
    if not looks_like_pdf(head):
        raise PdfError(f"le fichier {path.name} n'est pas un PDF valide")
    try:
        proc = subprocess.run(  # noqa: S603 - binaire fixe, arguments en liste, pas de shell
            [_pdftotext_bin(), "-layout", "-enc", "UTF-8", str(path), "-"],
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise PdfError(f"pdftotext a dépassé {timeout_seconds:.0f} s sur {path.name}") from exc
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", errors="replace").strip().splitlines()[:1]
        raise PdfError(f"pdftotext a échoué sur {path.name} (code {proc.returncode}) {' '.join(detail)}")
    text = proc.stdout.decode("utf-8", errors="replace")
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]  # pdftotext termine par un saut de page
    if not pages or not any(p.strip() for p in pages):
        raise PdfError(f"aucun texte extractible dans {path.name} (PDF scanné ou corrompu)")
    return pages
