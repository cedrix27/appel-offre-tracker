from __future__ import annotations

from datetime import date

import pytest

from collector.extract.rules import RulesExtractor, classify_sectors, find_budget, find_deadline
from tests.conftest import find_notice

PUB = date(2026, 10, 21)


@pytest.fixture(scope="module")
def extract(notices_4514):
    ex = RulesExtractor()
    return lambda needle: ex.extract(find_notice(notices_4514, needle), PUB)


def test_burkina_yin_wisgr_meta(extract):
    out = extract("BURKINA YIN WISGR META")
    d = out.data
    assert out.model == "rules:v1"
    assert d.organization == "BURKINA YIN WISGR META"
    assert d.title == "Acquisition de trois (03) imprimantes de tickets pour le stade du 4 août"
    assert d.reference == "N°2026-012/BYM/DG/PRCP"
    assert d.procedure_type == "Demande de prix"
    assert (d.submission_deadline, d.submission_time) == ("2026-10-30", "09:00")
    # HTVA 16 949 153 et TTC 20 000 000 publiés → TTC retenu ; caution 400 000 et dossier 30 000 ignorés
    assert (d.estimated_budget, d.budget_tax_basis) == (20_000_000, "TTC")
    assert d.funding_source == "Budget BYM, Exercice 2026"
    assert d.location is None
    assert d.categories == ["Fournitures et Services courants"]
    assert "informatique" in d.sectors
    assert d.publication_date == "2026-10-21"
    assert "Réservée aux entreprises Burkinabè" in d.eligibility_requirements
    assert "location" in d.missing_or_uncertain_fields
    assert "avant le 30/10/2026, à 09 heures" in out.evidence["submission_deadline"]
    assert "(20 000 000)" in out.evidence["estimated_budget"]
    assert d.summary.endswith(d.title)


def test_bumigeb(extract):
    d = extract("BUMIGEB").data
    assert d.organization == "BUREAU DES MINES ET DE LA GEOLOGIE DU BURKINA (BUMIGEB)"
    assert d.reference == "N°2026-15/BUMIGEB/DG/PRM"
    # « avant le le 30/10/2026 à 09 heures 00 minute » (coquille de la source)
    assert (d.submission_deadline, d.submission_time) == ("2026-10-30", "09:00")
    assert (d.estimated_budget, d.budget_tax_basis) == (82_600_000, "TTC")
    assert d.estimated_budget != 1_500_000  # garantie de soumission
    assert d.funding_source == "Budget BUMIGEB 2026"
    assert d.sectors == ["autres"]


def test_ami_ministere_construction(extract):
    out = extract("MINISTERE DE LA CONSTRUCT")
    d = out.data
    assert d.procedure_type == "Manifestation d'intérêt"
    assert d.reference == "N°2026//MCP/SG/DMP/SMT-PI"
    assert (d.submission_deadline, d.submission_time) == ("2026-11-04", "09:30")
    # aucun budget publié dans un AMI : jamais inventé
    assert d.estimated_budget is None
    assert d.budget_tax_basis is None
    assert "estimated_budget" in d.missing_or_uncertain_fields
    assert out.evidence["estimated_budget"] is None
    assert d.funding_source.startswith("Crédit IDA n°7413")
    assert d.location == "Bobo-Dioulasso, Kaya, Ouahigouya"
    assert "etudes_conseil" in d.sectors


def test_other_notices(extract):
    prise = extract("PRISE").data
    assert (prise.submission_deadline, prise.submission_time) == ("2026-11-06", "09:00")
    assert prise.estimated_budget is None
    assert prise.reference == "N°2026-00002/MCP/SP-PST/DM"
    chu = extract("PALA").data
    assert (chu.estimated_budget, chu.budget_tax_basis) == (15_100_000, "TTC")
    assert (chu.submission_deadline, chu.submission_time) == ("2026-10-27", "09:00")
    # montants par lot sans total publié : pas de somme calculée
    cegeci = extract("CENTRE DE GESTION DES CITES").data
    assert cegeci.estimated_budget is None
    assert "estimated_budget" in cegeci.missing_or_uncertain_fields
    mesfpt = extract("MESFPT").data
    assert (mesfpt.estimated_budget, mesfpt.budget_tax_basis) == (76_973_300, "TTC")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("devront parvenir avant le 30/10/2026, à 09 heures L'ouverture", ("2026-10-30", "09:00")),
        ("au plus tard le 04/11/2026 à 09 heures 30 mn TU avec", ("2026-11-04", "09:30")),
        ("remises avant le le 30/10/2026 à 09 heures 00 minute.", ("2026-10-30", "09:00")),
        ("au plus tard le 06 novembre\n2026 à 09 heures 00 mn GMT", ("2026-11-06", "09:00")),
        ("au plus tard le 27/10/2026 à 9h00 mn TU.", ("2026-10-27", "09:00")),
        ("au plus tard le mardi 1er décembre 2026.", ("2026-12-01", None)),
        ("au plus tard le 06 novembre 2026, sans heure", ("2026-11-06", None)),
        ("ouverture des plis le 30/10/2026 à 09 heures", (None, None)),
        ("aucune date ici", (None, None)),
        ("avant le 31/02/2026 à 09 heures", (None, None)),
    ],
)
def test_deadline_variants(text, expected):
    d, t = find_deadline(text)
    assert (d.value, t.value) == expected


def test_budget_never_takes_guarantee_or_file_cost():
    text = (
        "moyennant paiement d'un montant non remboursable de trente mille (30 000) FCFA. "
        "accompagnées d'une garantie de soumission d'un montant de quatre cent mille (400 000) F CFA"
    )
    amount, basis, _ = find_budget(text)
    assert amount.value is None and basis.value is None


def test_budget_htva_only_and_grouped_numbers():
    amount, basis, uncertain = find_budget("Montant prévisionnel : 82 600 000 FCFA HTVA. La participation")
    assert (amount.value, basis.value, uncertain) == (82_600_000, "HTVA", False)


def test_sectors_default_to_autres():
    assert classify_sectors("Acquisition d'outils de foration") == ["autres"]
    assert classify_sectors("Pauses-café et déjeuners") == ["restauration"]
