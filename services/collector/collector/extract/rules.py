"""Extracteur déterministe à base de règles (AI_PROVIDER=mock, et repli si OpenAI échoue).

Principe : n'extraire que ce qui est écrit. Toute valeur non trouvée → None, et le champ est
listé dans `missing_or_uncertain_fields`. Jamais de déduction (pas de somme de lots, pas de
caution ni de coût du dossier pris pour un montant prévisionnel).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, time

from collector.connectors.dgcmef import FRENCH_MONTHS
from collector.extract.base import ExtractionOutcome, Extractor
from collector.extract.schema import Evidence, TenderExtraction
from collector.segment import Notice
from collector.taxonomy import taxonomy, zones
from collector.text import compact, fold, strip_accents

MODEL_NAME = "rules:v1"

CRITICAL_FIELDS = (
    "reference",
    "organization",
    "procedure_type",
    "submission_deadline",
    "submission_time",
    "estimated_budget",
    "budget_tax_basis",
    "funding_source",
    "location",
    "description",
)


def fold_aligned(text: str) -> str:
    """Version repliée (minuscules, sans accents) de même longueur que `text`, pour que les
    positions d'une recherche sur le texte replié s'appliquent au texte original."""
    out = []
    for c in text:
        f = strip_accents(c).lower().replace("’", "'").replace("‘", "'")
        out.append(f[0] if len(f) == 1 else (f[:1] or c))
    return "".join(out)


@dataclass
class Found:
    value: object
    evidence: str | None


# ── Référence ────────────────────────────────────────────────────────────────────────────
_REF_LINE = re.compile(r"^(?:.*?\b)?n\s*[°o]\s*:?\s*(?=\d)", re.IGNORECASE)
_REF_CUT = re.compile(r"\s+(?:du|relatif|relative|portant)\b.*$", re.IGNORECASE)


def _normalize_ref_code(code: str) -> str:
    code = re.sub(r"\s*([/-])\s*", r"\1", compact(code))
    return code.strip(" .,;:")


def find_reference(notice: Notice) -> Found:
    lines = notice.header_lines
    try:
        start = lines.index(notice.notice_line) if notice.notice_line in lines else 0
    except ValueError:
        start = 0
    for line in [notice.notice_line, *lines[start : start + 4]]:
        m = _REF_LINE.match(line)
        if not m or not re.match(r"^\s*(?:avis|appel|n\s*[°o])", line, re.IGNORECASE):
            continue
        code = _REF_CUT.sub("", line[m.end() :])
        code = _normalize_ref_code(code)
        if re.match(r"^\d{4}", code) and len(code) >= 6:
            return Found(f"N°{code}", compact(line))
    return Found(None, None)


# ── Organisme ────────────────────────────────────────────────────────────────────────────
_AUTHORITY = re.compile(r"^autorit[ée] contractante\s*:\s*(.+)$", re.IGNORECASE)


def find_organization(notice: Notice) -> Found:
    if notice.organization:
        return Found(notice.organization, notice.organization)
    for line in notice.text.splitlines()[:25]:
        m = _AUTHORITY.match(line.strip())
        if m:
            return Found(compact(m.group(1)), compact(line))
    return Found(None, None)


# ── Type de procédure ───────────────────────────────────────────────────────────────────
def find_procedure(notice: Notice) -> Found:
    f = fold(notice.notice_line)
    if "demande de prix" in f or "demande de cotation" in f:
        value = "Demande de prix"
    elif "manifestation d'interet" in f or "manifestation d interet" in f or "manifestation" in f:
        value = "Manifestation d'intérêt"
    elif "demande de propositions" in f:
        value = "Demande de propositions"
    elif "appel d'offres" in f and "restreint" in f:
        value = "Appel d'offres restreint"
    elif "appel d'offres" in f and "ouvert" in f:
        value = "Appel d'offres ouvert"
    else:
        value = "Autre"
    return Found(value, notice.notice_line)


# ── Date limite ──────────────────────────────────────────────────────────────────────────
_MONTHS_RX = "|".join(sorted(FRENCH_MONTHS, key=len, reverse=True))
_DAYS_RX = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche"
_DEADLINE = re.compile(
    rf"(?:avant le|au plus tard le)(?:\s+le)?\s+(?:(?:{_DAYS_RX})\s+)?"
    rf"(?:(?P<d>\d{{1,2}})\s*[/.-]\s*(?P<m>\d{{1,2}})\s*[/.-]\s*(?P<y>\d{{4}})"
    rf"|(?P<d2>\d{{1,2}})(?:er)?\s+(?P<mn>{_MONTHS_RX})\s+(?P<y2>\d{{4}}))"
    rf"(?:\s*,)?(?:\s*(?:a|des)\s*(?P<h>\d{{1,2}})\s*(?:heures?|h)\s*(?:(?P<min>\d{{2}})(?!\d))?"
    rf"(?:\s*(?:mn|min|minutes?)\b)?(?:\s*(?:tu|gmt|t\.u\.?)\b)?)?"
)


def find_deadline(text: str) -> tuple[Found, Found]:
    """(date limite ISO, heure HH:MM). Seules « avant le … » / « au plus tard le … » comptent :
    la date d'ouverture des plis n'est jamais reprise comme date limite."""
    original = compact(text)
    folded = fold_aligned(original)
    for m in _DEADLINE.finditer(folded):
        try:
            if m.group("d"):
                d = date(int(m.group("y")), int(m.group("m")), int(m.group("d")))
            else:
                d = date(int(m.group("y2")), FRENCH_MONTHS[m.group("mn")], int(m.group("d2")))
        except ValueError:
            continue
        evidence = original[m.start() : m.end()].strip()
        t: str | None = None
        if m.group("h") is not None:
            hh, mm = int(m.group("h")), int(m.group("min") or 0)
            try:
                t = time(hh, mm).strftime("%H:%M")
            except ValueError:
                t = None
        return Found(d.isoformat(), evidence), Found(t, evidence if t else None)
    return Found(None, None), Found(None, None)


# ── Montant prévisionnel ─────────────────────────────────────────────────────────────────
_BUDGET_START = re.compile(r"(?:montant|enveloppe|budget)s? previsionnel(?:le)?s?")
_BUDGET_STOP = re.compile(
    r"garantie|caution|non rembours|cet avis|la participation|la presente demande de prix est reservee|"
    r"les acquisitions|le delai|delai d'execution"
)
_AMOUNT = re.compile(r"\((?P<p>\d{1,3}(?:[ .]\d{3})+|\d+)\)|(?<![\d(])(?P<b>\d{1,3}(?:[ .]\d{3})+)(?![\d)])")
_IMMEDIATE_BASIS = re.compile(r"^\s*(?:de\s+)?(?:f\s*cfa|francs?\s*cfa|fcfa)?\s*(?P<basis>htva|ht|ttc)\b")
_ANY_BASIS = re.compile(r"\b(htva|ht|ttc)\b")
_LOTS = re.compile(r"\blot\s*(?:n\s*[°o]\s*)?[1-9]\b|\bpar lot\b|\blots\b")


def find_budget(text: str) -> tuple[Found, Found, bool]:
    """(montant FCFA, base HT/HTVA/TTC, incertain). Préfère TTC quand HTVA et TTC sont publiés.
    Montant par lot / ambigu → None et signalé incertain (jamais de somme calculée)."""
    original = compact(text)
    folded = fold_aligned(original)
    m = _BUDGET_START.search(folded)
    if not m:
        return Found(None, None), Found(None, None), False
    end = min(len(folded), m.start() + 500)
    stop = _BUDGET_STOP.search(folded, m.end(), end)
    if stop:
        end = stop.start()
    window_f = folded[m.start() : end]
    evidence = original[m.start() : end].strip(" ,;")
    if _LOTS.search(window_f):
        return Found(None, evidence), Found(None, None), True
    amounts: list[tuple[int, str | None]] = []
    prev_end = 0
    for am in _AMOUNT.finditer(window_f):
        digits = re.sub(r"\D", "", am.group("p") or am.group("b"))
        value = int(digits)
        after = window_f[am.end() :]
        im = _IMMEDIATE_BASIS.match(after)
        if im:
            basis = im.group("basis")
            consumed = am.end() + im.end()
        else:
            before = window_f[prev_end : am.start()]
            found = _ANY_BASIS.findall(before)
            basis = found[-1] if found else None
            consumed = am.end()
        prev_end = consumed
        if value < 10_000:
            continue
        amounts.append((value, basis.upper() if basis else None))
    if not amounts:
        return Found(None, evidence), Found(None, None), True
    for wanted in ("TTC", "HTVA", "HT"):
        hits = [a for a in amounts if a[1] == wanted]
        if hits:
            return Found(hits[0][0], evidence), Found(wanted, evidence), False
    if len({a[0] for a in amounts}) == 1:
        return Found(amounts[0][0], evidence), Found(None, None), True
    return Found(None, evidence), Found(None, None), True


# ── Financement, lieu, objet, conditions ────────────────────────────────────────────────
_FUNDING = re.compile(r"^(?:mode de )?financement\s*:?\s+(?P<v>\S.+)$", re.IGNORECASE)


def find_funding(text: str) -> Found:
    for line in text.splitlines():
        m = _FUNDING.match(line.strip())
        if m:
            value = compact(m.group("v")).strip(" .;")
            if len(value) >= 3:
                return Found(value, compact(line))
    return Found(None, None)


_LOCATION = re.compile(
    r"(?:lieu d['’]ex[ée]cution|localit[ée]|lieu de livraison)\s*:\s*([^\n.;]{2,80})", re.IGNORECASE
)


def find_location(text: str, title: str) -> Found:
    m = _LOCATION.search(text)
    if m:
        return Found(compact(m.group(1)), compact(m.group(0)))
    ft = fold(title)
    hits: list[tuple[int, str]] = []
    for z in zones():
        if z == "National":
            continue
        rx = re.compile(rf"(?<![a-z]){re.escape(fold(z))}(?![a-z])")
        zm = rx.search(ft)
        if zm:
            hits.append((zm.start(), z))
    if hits:
        return Found(", ".join(z for _, z in sorted(hits)), title)
    return Found(None, None)


_OBJECT_PATTERNS = [
    re.compile(
        r"ayant (?:pour objet|portant)\s+(?:l['’]|la |le |les )?(?P<v>.+?)(?:,? tels? que|\.\s|$)",
        re.IGNORECASE,
    ),
    re.compile(
        r"afin de financer\s+(?:l['’]|la |le |les )?(?P<v>.+?)(?:,? et (?:à|a) l['’]intention|\.\s|$)",
        re.IGNORECASE,
    ),
    re.compile(
        r"services (?:de consultants? )?comprennent(?: entre autres)?\s*:\s*(?P<v>.+?)(?:\.\s|$)",
        re.IGNORECASE,
    ),
]


def find_description(text: str, title: str) -> Found:
    body = compact(text)
    for rx in _OBJECT_PATTERNS:
        m = rx.search(body)
        if m:
            v = m.group("v").strip(" ,;:")
            if 10 <= len(v) <= 600:
                return Found(v[0].upper() + v[1:], compact(m.group(0)))
    return Found(title, title) if title else Found(None, None)


_RESERVED = re.compile(
    r"est r[ée]serv[ée]e?\s*:?\s*(?P<v>(?:à|aux?)\s[^.]{3,200}?|[^.]{3,200}?)"
    r"(?=\.|\s+\d{1,2}\s*\.\s|\s+(?:Les|Le|La|Lot)\s|$)"
)
_AGREMENT = re.compile(r"agr[ée]ment[^.]{0,30}?\b[A-Z]\d{1,2}\b")


def find_eligibility(text: str) -> list[str]:
    body = compact(text)
    out: list[str] = []
    for m in _RESERVED.finditer(body):
        v = compact(m.group("v")).strip(' :«»"')
        if "sans objet" in fold(v) or not v:
            continue
        out.append(f"Réservée {v}" if not v.lower().startswith("réserv") else v)
    for m in _AGREMENT.finditer(body):
        v = compact(m.group(0))
        out.append(v[0].upper() + v[1:])
    return list(dict.fromkeys(out))


# ── Secteurs (taxonomie contrôlée) ──────────────────────────────────────────────────────
def _kw_regex(keyword: str) -> re.Pattern[str]:
    k = re.escape(fold(keyword).replace("-", " "))
    return re.compile(rf"(?<![a-z]){k}(?:s|x|es)?(?![a-z])")


def classify_sectors(*texts: str | None) -> list[str]:
    hay = fold(" ".join(t for t in texts if t)).replace("-", " ")
    found: list[str] = []
    for sector in taxonomy()["sectors"]:
        for kw in sector["keywords"]:
            if _kw_regex(kw).search(hay):
                found.append(sector["code"])
                break
    return found or ["autres"]


def build_summary(procedure: str | None, organization: str | None, title: str) -> str:
    """Résumé factuel construit uniquement à partir de l'intitulé (aucune information ajoutée)."""
    head = procedure or "Avis"
    return f"{head} — {organization} : {title}" if organization else f"{head} : {title}"


class RulesExtractor(Extractor):
    model_name = MODEL_NAME

    def extract(self, notice: Notice, publication_date: date | None = None) -> ExtractionOutcome:
        text = notice.text
        title = notice.title
        ref = find_reference(notice)
        org = find_organization(notice)
        proc = find_procedure(notice)
        dl, tm = find_deadline(text)
        budget, basis, budget_uncertain = find_budget(text)
        funding = find_funding(text)
        desc = find_description(text, title)
        loc = find_location(text, title)
        values = {
            "reference": ref.value,
            "organization": org.value,
            "procedure_type": proc.value,
            "submission_deadline": dl.value,
            "submission_time": tm.value,
            "estimated_budget": budget.value,
            "budget_tax_basis": basis.value,
            "funding_source": funding.value,
            "location": loc.value,
            "description": desc.value,
        }
        missing = [k for k in CRITICAL_FIELDS if values[k] is None]
        if budget_uncertain and "estimated_budget" not in missing:
            missing.append("estimated_budget")
        data = TenderExtraction(
            title=title,
            reference=ref.value,  # type: ignore[arg-type]
            organization=org.value,  # type: ignore[arg-type]
            description=desc.value,  # type: ignore[arg-type]
            categories=[notice.category] if notice.category else [],
            sectors=classify_sectors(title, desc.value if desc.value != title else None),  # type: ignore[arg-type]
            procedure_type=proc.value,  # type: ignore[arg-type]
            location=loc.value,  # type: ignore[arg-type]
            publication_date=publication_date.isoformat() if publication_date else None,
            submission_deadline=dl.value,  # type: ignore[arg-type]
            submission_time=tm.value,  # type: ignore[arg-type]
            estimated_budget=budget.value,  # type: ignore[arg-type]
            budget_tax_basis=basis.value,  # type: ignore[arg-type]
            funding_source=funding.value,  # type: ignore[arg-type]
            eligibility_requirements=find_eligibility(text),
            required_documents=[],
            summary=build_summary(proc.value, org.value, title),  # type: ignore[arg-type]
            missing_or_uncertain_fields=missing,
            evidence=Evidence(
                reference=ref.evidence,
                organization=org.evidence,
                submission_deadline=dl.evidence,
                estimated_budget=budget.evidence,
            ),
        )
        evidence = data.evidence.model_dump()
        evidence.update(
            {
                "title": title,
                "procedure_type": proc.evidence,
                "funding_source": funding.evidence,
                "location": loc.evidence,
                "description": desc.evidence,
            }
        )
        return ExtractionOutcome(data=data, model=MODEL_NAME, evidence=evidence)
