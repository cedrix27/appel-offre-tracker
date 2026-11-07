"""Nettoyage des pages d'un Quotidien DGCMEF et segmentation de la partie « AVIS » en avis.

Structure observée (audit, n°4514) — chaque avis commence par :
  catégorie (Fournitures et Services courants | Travaux | Prestations intellectuelles)
  → AUTORITÉ CONTRACTANTE (majuscules, 1–2 lignes)
  → intitulé
  → « Avis de demande de prix » / « Avis à manifestation d'intérêt » / « Appel à manifestation… »
  → référence (N°…) → Financement → corps.
Les « Résultats provisoires » (attributions) sont ignorés (D22).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from collector.text import compact, content_hash, fold, is_upper_heading

# ── Nettoyage des pieds / en-têtes répétés ───────────────────────────────────────────────
_MONTH = r"[A-Za-zÀ-ÿ]+"
_FOOTER_TOKENS = [
    # « N°3827 – lundi 04 Mars 2024 », « N° 4514– Mercredi 21 octobre 2026 », « N° 4106(bis) – … »
    re.compile(
        rf"N°\s*\d{{3,5}}\s*(?:\(\s*bis\s*\))?\s*[–—-]\s*{_MONTH}\s+\d{{1,2}}(?:er)?\s+{_MONTH}\s+\d{{4}}",
        re.IGNORECASE,
    ),
    re.compile(r"(?:https?://)?www\.(?:dgcmef|finances)\.gov\.bf/?", re.IGNORECASE),
    re.compile(r"\b\d{1,3}\b"),  # numéros de page seuls
]


def is_footer_line(line: str) -> bool:
    """Vrai si la ligne n'est composée que de jetons de pied/en-tête (dates d'édition, URL, n° de page)."""
    rest = line
    for rx in _FOOTER_TOKENS:
        rest = rx.sub(" ", rest)
    return not rest.strip() and bool(line.strip())


def clean_page(text: str) -> list[str]:
    """Lignes nettoyées d'une page : espaces internes compactés, pieds de page retirés,
    lignes vides consécutives fusionnées (une ligne vide = séparation de paragraphe)."""
    out: list[str] = []
    for raw in text.splitlines():
        line = compact(raw)
        if line and is_footer_line(line):
            continue
        if not line:
            if out and out[-1] == "":
                continue
            out.append("")
            continue
        out.append(line)
    while out and out[0] == "":
        out.pop(0)
    while out and out[-1] == "":
        out.pop()
    return out


# ── Repères de structure ─────────────────────────────────────────────────────────────────
_CATEGORY = re.compile(
    r"^(?:marches de )?(fournitures et services courants|travaux|prestations intellectuelles)$"
)
_CATEGORY_LABELS = {
    "fournitures et services courants": "Fournitures et Services courants",
    "travaux": "Travaux",
    "prestations intellectuelles": "Prestations intellectuelles",
}
# Ligne d'avis : « Avis de demande de prix », « Avis à manifestation d'intérêt », « APPEL À MANIFESTATION… »,
# « AVIS DE REPORT … », « Avis rectificatif »…
_NOTICE_LINE = re.compile(
    r"^(?:avis|appel)\b.*\b(?:prix|manifestation|interet|offres?|propositions|cotations?|consultation|"
    r"report|rectificatif|annulation|sollicitation)\b"
)
_AMENDMENT = re.compile(r"\b(?:report|rectificatif|annulation|prorogation|communique)\b")
_RESULTS = re.compile(r"^resultats? provisoires?$")
_MIN_LINES_BEFORE_NEW_BOUNDARY = 15


def category_of(line: str) -> str | None:
    m = _CATEGORY.match(fold(line))
    return _CATEGORY_LABELS[m.group(1)] if m else None


def is_notice_line(line: str) -> bool:
    return bool(_NOTICE_LINE.match(fold(line)))


@dataclass
class Notice:
    """Un avis segmenté dans un quotidien."""

    category: str | None
    organization: str | None
    title: str
    notice_line: str
    header_lines: list[str]
    text: str
    pages: list[int]
    kind: str = "avis"  # "avis" | "rectificatif" (report, annulation… : non traité au MVP)
    content_hash: str = field(default="")

    def __post_init__(self) -> None:
        if not self.content_hash:
            self.content_hash = content_hash(self.text)


@dataclass
class _Line:
    page: int
    text: str


def find_avis_pages(pages: list[str]) -> tuple[int, list[list[str]]]:
    """Retourne (numéro de la 1re page AVIS, lignes nettoyées des pages AVIS).

    La partie AVIS commence à la première page (après la couverture et le sommaire) dont la
    première ligne utile est une catégorie de marché ; elle s'arrête si une page commence par
    « Résultats provisoires ».
    """
    cleaned = [clean_page(p) for p in pages]
    start = None
    for idx in range(2, len(cleaned)):
        first = next((ln for ln in cleaned[idx] if ln), None)
        if first and category_of(first):
            start = idx
            break
    if start is None:
        return 0, []
    selected: list[list[str]] = []
    for idx in range(start, len(cleaned)):
        first = next((ln for ln in cleaned[idx] if ln), "")
        if _RESULTS.match(fold(first)):
            break
        selected.append(cleaned[idx])
    return start + 1, selected


def _starts_new_block(lines: list[_Line], i: int, current_len: int) -> bool:
    """Début d'un bloc sans catégorie (ex. avis de report) : TITRE EN MAJUSCULES suivi, à
    quelques lignes, d'une ligne « Avis … »/« Appel … ». Ignoré dans l'en-tête de l'avis courant."""
    if current_len < _MIN_LINES_BEFORE_NEW_BOUNDARY:
        return False
    line = lines[i].text
    if not line or not is_upper_heading(line, min_letters=8) or is_notice_line(line):
        return False
    seen = 0
    for j in range(i + 1, len(lines)):
        nxt = lines[j].text
        if not nxt:
            continue
        seen += 1
        if is_notice_line(nxt):
            return True
        if seen >= 4 or category_of(nxt):
            return False
    return False


def segment_notices(pages: list[str]) -> list[Notice]:
    """Segmente la partie AVIS d'un quotidien (liste du texte brut par page) en avis."""
    first_page, avis_pages = find_avis_pages(pages)
    if not avis_pages:
        return []
    flat: list[_Line] = []
    for offset, page_lines in enumerate(avis_pages):
        page_no = first_page + offset
        if flat and flat[-1].text != "":
            flat.append(_Line(page_no, ""))  # saut de page = fin de paragraphe
        flat.extend(_Line(page_no, ln) for ln in page_lines)

    blocks: list[list[_Line]] = []
    current: list[_Line] = []
    nonblank = 0
    for i, ln in enumerate(flat):
        if ln.text and (category_of(ln.text) or _starts_new_block(flat, i, nonblank)):
            if current:
                blocks.append(current)
            current, nonblank = [], 0
        current.append(ln)
        if ln.text:
            nonblank += 1
    if current:
        blocks.append(current)

    notices: list[Notice] = []
    last_category: str | None = None
    for block in blocks:
        notice = _parse_block(block, last_category)
        if notice is None:
            continue
        last_category = notice.category or last_category
        notices.append(notice)
    return notices


def _parse_block(block: list[_Line], inherited_category: str | None) -> Notice | None:
    lines = list(block)
    while lines and not lines[-1].text:
        lines.pop()
    nonblank_idx = [k for k, ln in enumerate(lines) if ln.text]
    if not nonblank_idx:
        return None
    k = nonblank_idx[0]
    category = category_of(lines[k].text)
    if category:
        k += 1
    else:
        category = inherited_category
    # Ligne « Avis … » : dans les 15 premières lignes non vides.
    notice_idx = None
    for idx in [j for j in nonblank_idx if j >= k][:15]:
        if is_notice_line(lines[idx].text):
            notice_idx = idx
            break
    if notice_idx is None:
        return None  # bloc sans ligne d'avis : pas un avis (texte isolé, fin de section…)

    # Autorité contractante : lignes MAJUSCULES contiguës juste après la catégorie.
    while k < notice_idx and not lines[k].text:
        k += 1
    org_lines: list[str] = []
    while k < notice_idx and lines[k].text and is_upper_heading(lines[k].text):
        org_lines.append(lines[k].text)
        k += 1
    # Intitulé : lignes entre l'organisme et la ligne « Avis … ». Une ligne tout en majuscules
    # après un intitulé en casse mixte (ex. « SELECTION DE CONSULTANT PAR LES EMPRUNTEURS… ») l'arrête.
    title_lines: list[str] = []
    for idx in range(k, notice_idx):
        t = lines[idx].text
        if not t:
            continue
        if title_lines and is_upper_heading(t) and not is_upper_heading(" ".join(title_lines)):
            break
        title_lines.append(t)
    notice_line = lines[notice_idx].text
    header_lines = [ln.text for ln in lines[nonblank_idx[0] : min(len(lines), notice_idx + 6)] if ln.text]
    # Sans intitulé propre (ex. avis de report), l'intitulé est la ligne d'avis elle-même.
    title = compact(" ".join(title_lines)) or compact(notice_line)
    text = "\n".join(ln.text for ln in lines).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    pages = sorted({ln.page for ln in lines if ln.text})
    kind = "rectificatif" if _AMENDMENT.search(fold(notice_line)) else "avis"
    return Notice(
        category=category if kind == "avis" else None,
        organization=compact(" ".join(org_lines)) or None,
        title=title.rstrip(" ,;"),
        notice_line=compact(notice_line),
        header_lines=header_lines,
        text=text,
        pages=pages,
        kind=kind,
    )
