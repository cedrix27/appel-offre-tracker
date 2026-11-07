# 02 — Audit des sources (réalisé le 5 novembre 2026)

Méthode : requêtes HTTP manuelles et peu nombreuses (`curl`, User-Agent
`SRC-Digital-Audit/0.1`), lecture de `robots.txt`, téléchargement d'un seul
quotidien PDF. Aucun contournement.

## Synthèse

| Source | Accès | robots.txt | Contenu utile | Verdict |
|---|---|---|---|---|
| **DGCMEF** `dgcmef.gov.bf` | 200, public, Drupal | Autorise tout sauf `/admin`, `/user`, `/search`… | **Quotidien des marchés publics** en PDF, 1 par jour ouvré | ✅ **Connecteur n°1** |
| SECOP `secop.finances.bf` | 200 | Pas d'interdiction | « Système électronique de délivrance des **Pièces Administratives** » — pas un portail d'avis | ❌ Pas une source d'annonces |
| ARCOP `arcop.bf` | 200 mais **« Site en maintenance »** | 404 | — | ⏸ À réauditer plus tard |
| Ministère des Finances `finances.gov.bf` | **Connexion refusée** (port 443) | — | — | ⏸ Indisponible le 05/11/2026 |
| UEMOA `uemoa.int` | 200, Drupal | `Crawl-delay: 10` pour `*` | Lien `/appel-d-offre` (avis régionaux, surtout UEMOA elle-même) | 🟡 Complément V2 |
| offres360.bf (privé) | 200 | `Disallow:` vide | Agrégateur commercial | 👁 Comparaison manuelle uniquement, pas de réutilisation sans accord |
| vigisdata.com (privé) | 200 | Bloque explicitement GPTBot, ClaudeBot… | Observatoire | 👁 Comparaison manuelle uniquement |

## DGCMEF — détail

### Découverte des quotidiens
- Page liste : `https://www.dgcmef.gov.bf/index.php/fr/appels-d-offre`
  → les **10 derniers** quotidiens, liens `node/NNNN`. `?page=1` renvoie la même liste
  (pas de pagination exploitable ; l'historique est dans « Archives »).
- Chaque entrée : `Quotidien n° 4514 – Mercredi 21 octobre 2026` → PDF
  `https://www.dgcmef.gov.bf/sites/default/files/2026-10/Quotidien%20n%C2%B04514.pdf`
- Les noms de fichiers sont **irréguliers** (`n°`/`N°`, espace avant `.pdf`) :
  ne jamais construire l'URL, toujours la lire depuis la page.
- En-têtes HTTP : `ETag` et `Last-Modified` présents → requêtes conditionnelles possibles.
- ⚠️ **Décalage de publication** : au 05/11/2026, le dernier quotidien en ligne
  est le n°4514 du **21/10/2026**. Le site n'est pas mis à jour quotidiennement.
  Conséquence produit : afficher « dernière publication source : … » et ne
  **jamais** interpréter une absence de nouveau quotidien comme « aucun appel d'offres ».

### Format du PDF (n°4514, 44 pages, 2,5 Mo)
- Généré par **Microsoft Word** → texte natif extractible (`pdftotext`), pas d'OCR nécessaire.
  Seules quelques pages (circulaires, p. 3–4, 44) sont des images.
- Structure :
  - p. 1–2 : couverture, sommaire ;
  - **« Résultats provisoires »** (p. 5–31) : attributions, tableaux complexes → hors MVP ;
  - **« Avis »** (p. 32+) : classés par *Ministères/Institutions* puis *Régions*,
    et par type : fournitures & services courants, travaux, prestations intellectuelles.
- Dans ce numéro : 11 « Avis de demande de prix » + 3 « Avis à manifestation d'intérêt ».
- Segmentation fiable : chaque avis commence par
  `catégorie → AUTORITÉ CONTRACTANTE (majuscules) → intitulé → « Avis de … » → référence → Financement`.
- Champs présents dans le texte : référence (`N°2026-012/BYM/DG/PRCP`), financement,
  montant prévisionnel (souvent en lettres + chiffres, HTVA/TTC), lots, délai
  d'exécution, coût du dossier, garantie, **date limite** (`avant le 30/10/2026, à 09 heures`,
  `au plus tard le 06 novembre…`), agrément requis (`D5`), réservation
  (entreprises burkinabè / communautaires).
- Bruit à nettoyer : pieds de page répétés (`N°3827 – lundi 04 Mars 2024`,
  `www.dgcmef.gov.bf`, numéros de page), typos (`avant le le`).

### Recommandations connecteur DGCMEF
1. Fréquence : 1 passage/jour (07 h BF) + 1 relance à 14 h ; délai ≥ 5 s entre requêtes.
2. Idempotence : clé = numéro de quotidien + SHA-256 du PDF ; avis = SHA-256 du texte normalisé.
3. Conserver : URL de la page, URL du PDF, n° de quotidien, **pages** de l'avis, texte brut extrait.
4. Lien « source officielle » dans l'e-mail = PDF DGCMEF + numéro de page
   (le quotidien précise que seule la version du site DGCMEF fait foi).
5. Contact : envoyer un courrier à la DGCMEF (`dgcmef@finances.gov.bf`) pour
   informer de la réutilisation et demander s'il existe un flux/une liste de diffusion.
