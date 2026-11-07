# 05 — Adaptation du design system à SRC Digital

Source : `design-system.md` (écrit pour WelcomeBack). On garde le langage visuel
**« papier chaud »** ; on remplace la partie métier (carte de fidélité) par les
écrans de veille d'appels d'offres.

**Décision (05/11/2026)** : même style, thème **rouge / blanc / noir**. L'accent violet
est remplacé par un rouge. Boutons : noir (principal) et rouge (`brand`, appels à l'action), texte blanc.
Implémentation : `apps/web/src/app/globals.css`.

## Palette rouge (remplace le violet)

| Token | Valeur | Usage |
|---|---|---|
| `brand` | `#d4232b` | Bouton `brand`, mots en avant, logo |
| `brand-hover` | `#b81d24` | Survol |
| `brand-ink` | `#a3161d` | Liens, texte rouge sur fond clair |
| `brand-soft` / `brand-wash` / `brand-line` | `#fdeeee` / `#fff7f6` / `#f6caca` | Badge « Nouveau », pastilles d'icône |
| `eyebrow` | `#c2484d` | Sur-titres 11 px uppercase |
| `danger` | `#a8261e` | Erreurs uniquement, **toujours avec icône + libellé** (le rouge de marque ne signifie pas « erreur ») |

## Ce qui est repris tel quel
- Neutres chauds (encre `#171716`, canvas `#fafaf8`, lignes `#e9e8e5`…), succès et warning.
- Plus Jakarta Sans ; 600 titres/chiffres, 500 boutons, 400 corps ; corps 13–14 px.
- Rayons : boutons/inputs 12, cartes 20, panneaux 22 ; bordures 1 px, pas d'ombre.
- **Bouton principal noir**, bouton `brand` rouge pour les appels à l'action ; anneau de focus rouge.
- Motion `fade-up` / `pop`, `prefers-reduced-motion` respecté. Cibles 44 px.

## Correspondance sémantique pour les appels d'offres

| Sens | Couleur | Usage |
|---|---|---|
| Pertinence forte (score ≥ 75) | Success `#287a57` / soft `#ecfdf5` | Pastille score |
| Échéance proche (≤ 7 jours) | Warning `#c9772b` / soft `#fff0e3` | Badge « J-3 » |
| Clôturé / annulé | Neutre `#f3f1ed` / `#77736f` | Badge statut |
| Collecte échouée / erreur | Danger `#a8261e` / soft `#fbe9e7` + icône | Admin, formulaires |
| Nouveau / accent | Brand soft `#fdeeee`, brand ink `#a3161d` | Badge « Nouveau » |
| « Non précisé » | Texte hint `#aaa6a1`, italique | Champs absents — jamais coloré comme une valeur |

Toujours un libellé texte en plus de la couleur (« Échéance dans 3 jours », « Score 82/100 »).

## Composants clés
- **Carte d'appel d'offres** : organisme (eyebrow 11 px uppercase), titre 15–16 px/600,
  date limite, score, catégorie, lien « Source officielle (DGCMEF, p. 32) ».
- **Chiffres du dashboard** : 48 px, `tabular-nums`, tracking −0.045em.
- **Admin sources** : 3 états distincts — succès + nouvelles annonces / succès sans
  nouvelle annonce / échec (jamais confondus).
- **E-mail digest** : mêmes couleurs, tableaux HTML inline, largeur 600 px, lisible sur Android 360 px.

## Intégration technique
Tokens en variables CSS (`apps/web/app/globals.css`) mappées vers le thème shadcn/ui
(`--primary` = encre, `--accent` = brand soft, `--ring` = rouge, `--radius` = 12px).
Composants shadcn (style `base-nova`, primitives Base UI) dans `apps/web/src/components/ui/`.
