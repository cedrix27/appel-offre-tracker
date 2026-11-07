"""Segmentation du Quotidien DGCMEF n°4514 (fixture réelle, D21).

Décompte vérifié à la main sur le PDF (pages 32-43 ; p. 44 = 4e de couverture en image) :
10 avis d'appel à la concurrence = 8 « Avis de demande de prix » (dont 1 « à commande »)
+ 2 avis/appels à manifestation d'intérêt, plus 1 « Avis de report » (SONABEL, p. 40) qui n'est
pas un nouvel avis. L'audit initial (« 11 + 3 ») comptait les occurrences de l'expression dans le
texte, pas les avis.
"""

from __future__ import annotations

import re

from collector.segment import clean_page, find_avis_pages, is_footer_line
from collector.text import content_hash
from tests.conftest import find_notice


def test_pdf_has_44_pages(pages_4514):
    assert len(pages_4514) == 44


def test_avis_section_starts_page_32(pages_4514):
    first, pages = find_avis_pages(pages_4514)
    assert first == 32
    assert len(pages) == 13  # pages 32 à 44


def test_exact_number_of_notices(notices_4514):
    avis = [n for n in notices_4514 if n.kind == "avis"]
    rectificatifs = [n for n in notices_4514 if n.kind == "rectificatif"]
    assert len(avis) == 10
    assert len(rectificatifs) == 1
    assert "SONABEL" in rectificatifs[0].text
    dp = [n for n in avis if "demande de prix" in n.notice_line.lower()]
    ami = [n for n in avis if "manifestation" in n.notice_line.lower()]
    assert (len(dp), len(ami)) == (8, 2)


def test_notice_pages(notices_4514):
    pages = [n.pages for n in notices_4514 if n.kind == "avis"]
    assert pages == [[32], [33], [34], [35], [36], [37], [38], [39, 40], [41, 42], [43]]


def test_burkina_yin_wisgr_meta(notices_4514):
    n = find_notice(notices_4514, "BURKINA YIN WISGR META")
    assert n.organization == "BURKINA YIN WISGR META"
    assert n.title == "Acquisition de trois (03) imprimantes de tickets pour le stade du 4 août"
    assert n.category == "Fournitures et Services courants"
    assert n.pages == [32]


def test_bumigeb(notices_4514):
    n = find_notice(notices_4514, "BUMIGEB")
    assert n.organization == "BUREAU DES MINES ET DE LA GEOLOGIE DU BURKINA (BUMIGEB)"
    assert n.title == "Acquisition d'outils de foration au profit du BUMIGEB"
    assert n.pages == [33]


def test_ami_ministere_construction_patrie(notices_4514):
    n = find_notice(notices_4514, "MINISTERE DE LA CONSTRUCT")
    # libellé tel qu'imprimé dans le quotidien (troncature de la source conservée)
    assert n.organization == "MINISTERE DE LA CONSTRUCT DE LA PATRIE"
    assert n.category == "Prestations intellectuelles"
    assert n.notice_line == "Avis à manifestation d’intérêt"
    assert n.title.startswith("Sélection de consultants (bureaux d’études) pour l’élaboration de trois (03)")
    assert n.title.endswith("à Bobo-Dioulasso, Kaya et Ouahigouya.")
    assert "BANQUE MONDI" not in n.title
    assert n.pages == [39, 40]
    # l'avis chevauche deux pages et s'arrête avant l'avis de report SONABEL
    assert "au plus tard le 04/11/2026" in n.text
    assert "SONABEL" not in n.text


def test_footers_removed(notices_4514):
    footer = re.compile(r"N°\s*3827|N°\s*4514\s*–|www\.dgcmef\.gov\.bf|www\.finances\.gov\.bf")
    for n in notices_4514:
        assert not footer.search(n.text), n.organization
        for line in n.text.splitlines():
            assert not re.fullmatch(r"\s*\d{1,3}\s*", line), (n.organization, line)


def test_footer_detection():
    assert is_footer_line("N°3827 – lundi 04 Mars 2024 32")
    assert is_footer_line("N° 4514– Mercredi 21 octobre 2026")
    assert is_footer_line("www.dgcmef.gov.bf www.finances.gov.bf")
    assert is_footer_line("N°3827 – lundi 04 Mars 2024 N° 4106(bis) – Vendredi 28 mars 2025 1")
    assert is_footer_line("44")
    assert not is_footer_line("avant le 30/10/2026, à 09 heures")
    assert not is_footer_line("(20 000 000)")
    assert clean_page("a\n\n\n\nb\n  12  \n") == ["a", "", "b"]


def test_content_hash_is_normalized(notices_4514):
    n = notices_4514[0]
    assert n.content_hash == content_hash(n.text)
    assert content_hash("Avis  DE\n prix ") == content_hash("avis de prix")
    assert len({x.content_hash for x in notices_4514}) == len(notices_4514)
