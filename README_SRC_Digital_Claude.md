# SRC Digital --- SaaS de veille intelligente des appels d'offres (Burkina Faso)

> Cahier des charges et instructions de développement pour Claude Code.

## 1. Mission

Construire une plateforme SaaS multi-entreprises qui surveille les
appels d'offres publiés au **Burkina Faso uniquement**, analyse les
annonces avec l'API OpenAI, les rapproche des préférences des
entreprises clientes et envoie un récapitulatif personnalisé par e-mail
chaque jour.

Chaque entreprise doit pouvoir : - créer un compte et renseigner son
profil ; - sélectionner ses secteurs, mots-clés, exclusions et zones
d'intervention ; - consulter les appels d'offres correspondant à ses
critères ; - recevoir des alertes quotidiennes par e-mail ; - ouvrir la
fiche détaillée et retrouver la publication officielle et ses documents.

La collecte est mutualisée : une annonce est récupérée une seule fois,
enregistrée dans la base centrale, puis distribuée aux entreprises
pertinentes. Les données propres à chaque entreprise doivent rester
isolées.

**Périmètre MVP :** Burkina Faso, français, fuseau `Africa/Ouagadougou`
(UTC), alertes e-mail, tableau de bord, administration et API OpenAI. La
couverture multi-pays et la génération de dossiers de candidature sont
hors périmètre initial.

## 2. Instructions impératives pour Claude Code

1.  Inspecter le dépôt existant avant de créer ou modifier des fichiers.
    Respecter les conventions et réutiliser ce qui existe.
2.  Ne pas réécrire inutilement le projet et ne pas tout générer dans un
    seul fichier.
3.  Procéder par modules, avec une application exécutable à chaque
    étape.
4.  Utiliser TypeScript strict lorsque possible et valider toutes les
    entrées côté serveur.
5.  Ne jamais exposer de clé API ou secret dans le frontend ou dans Git.
6.  Créer des migrations versionnées et des tests pour les fonctions
    critiques.
7.  Ne jamais inventer une date limite, un montant, un organisme ou une
    condition d'éligibilité. Une donnée absente reste `null` / « Non
    précisé ».
8.  Conserver la source, l'URL, la date de collecte et les éléments de
    preuve disponibles pour chaque annonce.
9.  Vérifier les conditions d'utilisation, règles d'accès et limites de
    fréquence des sites. Privilégier les API et flux autorisés. Ne pas
    contourner CAPTCHA, authentification, paywall ou protection
    technique.
10. Avant chaque grande étape, expliquer brièvement les fichiers
    concernés et le résultat attendu. Après l'étape, donner les
    commandes de lancement et de test.
11. Ne pas déclarer une fonctionnalité terminée sans test ou procédure
    de vérification.
12. Si un choix secondaire manque, prendre une hypothèse raisonnable, la
    documenter et continuer. Poser une question seulement si le choix
    change fortement le périmètre ou l'architecture.

**Ordre de travail :** audit du dépôt → cadrage technique → audit des
sources → modèle de données et contrats API → développement incrémental
→ tests → déploiement pilote.

## 3. Architecture cible

Pour le MVP, privilégier un **monolithe modulaire avec workers
asynchrones**, pas des microservices prématurés.

  -----------------------------------------------------------------------
  Couche                  Technologie cible       Responsabilité
  ----------------------- ----------------------- -----------------------
  Frontend                Next.js, TypeScript,    Site public, espace
                          Tailwind CSS, shadcn/ui entreprise, dashboard,
                                                  administration

  Backend                 NestJS, TypeScript      Authentification,
                                                  entreprises,
                                                  préférences, annonces,
                                                  API métier

  Collecteur              Python                  Connecteurs,
                                                  récupération HTML/PDF,
                                                  extraction, OCR si
                                                  nécessaire

  IA                      API OpenAI (Responses   Extraction structurée,
                          API)                    classification, résumé,
                                                  matching assisté

  Base de données         PostgreSQL              Comptes, entreprises,
                                                  annonces, préférences,
                                                  correspondances,
                                                  notifications

  Jobs                    Redis + BullMQ (ou      Scheduler, files de
                          Celery si orchestration tâches, reprises sur
                          Python retenue)         erreur

  Documents               Stockage objet          PDF et pièces jointes
                          compatible S3           lorsque leur
                                                  conservation est
                                                  autorisée

  E-mail                  Fournisseur             Vérification de compte
                          transactionnel SMTP/API et alertes
  -----------------------------------------------------------------------

Structure indicative à adapter au dépôt existant :

``` text
project/
├── apps/
│   ├── web/                 # Next.js
│   └── api/                 # NestJS
├── services/
│   └── collector/           # Python : collecte, parsing, OpenAI
├── packages/
│   └── shared/              # contrats/types partagés si utile
├── infrastructure/
├── docs/
├── .env.example
└── docker-compose.yml
```

Principes : - NestJS est le point d'entrée métier. - Le collecteur
Python est exécuté en arrière-plan. - Les appels OpenAI et les e-mails
ne doivent pas bloquer les requêtes HTTP. - Les jobs doivent être
idempotents : une relance ne crée pas de doublons ni de notifications
répétées. - Stocker les dates en UTC ; planifier et afficher selon
`Africa/Ouagadougou`. - Les annonces sont globales ; préférences,
favoris, correspondances et notifications sont propres à chaque
entreprise.

## 4. Cycle automatique quotidien

Heure proposée : **07 h 00, heure du Burkina Faso**, configurable.

1.  Un scheduler déclenche le processus quotidien.
2.  Les connecteurs interrogent les sources activées.
3.  Les nouvelles publications et mises à jour HTML/PDF sont récupérées.
4.  Le texte est extrait ; OCR seulement pour les documents scannés.
5.  Les champs sont normalisés et les doublons détectés.
6.  OpenAI classe, résume et extrait les informations dans un schéma
    contrôlé.
7.  Les champs critiques sont validés ; les informations incertaines
    restent signalées.
8.  Le moteur compare les annonces aux préférences de chaque entreprise.
9.  Un digest personnalisé est envoyé à chaque entreprise.
10. Les résultats, erreurs et notifications sont journalisés.

### Rôle exact de l'API OpenAI

L'API OpenAI ne se déclenche pas seule à heure fixe. **C'est notre
application qui lance le traitement** avec un scheduler. OpenAI
intervient ensuite pour analyser le contenu collecté.

L'outil `web_search` de l'API Responses peut servir de complément de
découverte, mais ne garantit pas l'exhaustivité des annonces burkinabè.
Le cœur du produit doit reposer sur des connecteurs de sources
identifiées et testées. Ne jamais transformer une réponse de recherche
Web en preuve d'exhaustivité.

## 5. Sources à auditer en premier

Vérifier leur disponibilité réelle, les formats publiés, l'accès public
et les conditions d'automatisation avant de développer les connecteurs.

  --------------------------------------------------------------------------------
  Source                  URL                            Rôle envisagé
  ----------------------- ------------------------------ -------------------------
  DGCMEF                  https://www.dgcmef.gov.bf/     Source prioritaire à
                                                         auditer : avis et
                                                         publications/quotidiens
                                                         des marchés publics,
                                                         notamment PDF

  Ministère de l'Économie https://www.finances.gov.bf/   Source institutionnelle
  et des Finances                                        complémentaire

  ARCOP                   https://www.arcop.bf/          Réglementation,
                                                         informations et documents
                                                         de référence ; vérifier
                                                         les avis disponibles

  SECOP                   https://secop.finances.bf/     Étudier les avis
                                                         accessibles publiquement
                                                         et les conditions d'accès

  UEMOA                   https://www.uemoa.int/         Source complémentaire
                                                         éventuelle pour les avis
                                                         régionaux concernant le
                                                         Burkina Faso
  --------------------------------------------------------------------------------

Sites privés à observer à titre de comparaison, sans présumer qu'ils
autorisent la réutilisation automatisée : -
https://offres360.bf/appels-doffres - https://vigisdata.com/observatoire

Créer un registre des sources (`sources`) avec : nom, URL, type, méthode
d'accès autorisée, fréquence, statut, dernière collecte réussie, taux
d'erreur et notes techniques.

**Premier connecteur recommandé : DGCMEF et ses publications/quotidiens
PDF.** Auditer d'abord les pages réelles et les fichiers disponibles. Ne
pas coder un scraper sur la base d'hypothèses. Si l'accès automatisé
n'est pas autorisé ou techniquement fiable, documenter une alternative.

## 6. Modules fonctionnels

### 6.1 Site public

-   Présentation du service, fonctionnement et avantages.
-   Contact / demande de démonstration.
-   Inscription et connexion.
-   Pages légales et politique de confidentialité à prévoir avant
    commercialisation.

### 6.2 Authentification et utilisateurs

-   Inscription, vérification e-mail, connexion/déconnexion.
-   Réinitialisation du mot de passe.
-   Rôles : `SUPER_ADMIN`, `COMPANY_ADMIN`, `COMPANY_MEMBER`.
-   Une entreprise peut avoir plusieurs utilisateurs.
-   Mots de passe hachés avec Argon2id ou équivalent.

### 6.3 Profil entreprise

Champs possibles : raison sociale, nom commercial, description, secteur
principal et secondaires, compétences, prestations, ville/adresse, zones
d'intervention au Burkina Faso, e-mail, téléphone, site web et statut.

### 6.4 Préférences de veille

-   Secteurs surveillés.
-   Mots-clés inclus et exclus.
-   Type de marché/procédure si disponible.
-   Région ou ville.
-   Budget minimum/maximum si publié dans l'avis.
-   Seuil de pertinence.
-   Destinataires des e-mails.
-   Activation/désactivation de la veille.

### 6.5 Gestion des annonces

Champs à extraire autant que possible : - titre et référence ; -
organisme émetteur ; - objet/description ; - catégorie/secteur ; - type
de procédure si disponible ; - lieu d'exécution ; - date de publication
; - date et heure limites ; - budget si explicitement publié ; -
critères/conditions et pièces requises ; - liens vers documents ; - URL
originale et source ; - date de collecte et dernière vérification ; -
statut : nouveau, mis à jour, clôturé, annulé ou attribué si vérifié.

Ne jamais déduire la date limite ou le budget. Afficher « Non précisé »
lorsque la source ne fournit pas l'information.

### 6.6 Analyse IA

OpenAI doit : 1. Extraire les champs depuis le contenu fourni. 2.
Classifier l'annonce dans une taxonomie contrôlée. 3. Produire un résumé
concis. 4. Identifier les champs absents, ambigus ou incertains. 5.
Aider à comparer l'annonce au profil entreprise. 6. Retourner un score
indicatif et une justification.

Exemple de structure JSON attendue (à valider avec un schéma strict) :

``` json
{
  "title": "Intitulé extrait",
  "reference": null,
  "organization": "Organisme émetteur",
  "description": "Objet extrait",
  "categories": ["Informatique"],
  "location": null,
  "publication_date": null,
  "submission_deadline": null,
  "submission_time": null,
  "estimated_budget": null,
  "eligibility_requirements": [],
  "required_documents": [],
  "summary": "Résumé concis",
  "missing_or_uncertain_fields": ["submission_deadline"]
}
```

Le modèle ne doit pas présenter comme certain un champ absent de la
source. Conserver le texte extrait ou les passages justificatifs pour
audit.

### 6.7 Matching

MVP : - filtres déterministes sur secteurs, mots-clés et exclusions ; -
similarité sémantique en complément si utile ; - score de pertinence sur
100 ; - justification lisible ; - seuil configurable par entreprise.

Le score n'est pas une garantie d'éligibilité ou de succès. L'entreprise
doit consulter le dossier officiel.

### 6.8 E-mails

Un digest quotidien par entreprise comprenant : - date de génération et
nombre de nouvelles annonces ; - titre, organisme, objet ; - date limite
si vérifiée ; - résumé ; - score indicatif et raison du rapprochement
; - lien vers la fiche SaaS et lien vers la source officielle ; -
indication des champs non précisés.

Créer un e-mail responsive. Enregistrer chaque envoi et son statut. Ne
pas renvoyer le même digest lors d'un redémarrage de worker.

### 6.9 Dashboard entreprise

-   Nombre de nouvelles annonces correspondantes.
-   Opportunités récentes et échéances proches.
-   Filtres : secteur, organisme, région, période.
-   Recherche textuelle et détail d'annonce.
-   Favoris et statut : à examiner, intéressé, candidature en cours,
    ignoré.
-   Historique des alertes.

### 6.10 Administration SRC Digital

-   Entreprises et utilisateurs.
-   Activation/suspension de comptes.
-   Gestion des sources et connecteurs.
-   Historique des collectes, erreurs et annonces.
-   Suivi des notifications et statistiques.
-   Relance contrôlée d'un connecteur/job.

## 7. Modèle de données minimal

  -----------------------------------------------------------------------
  Table                               Rôle
  ----------------------------------- -----------------------------------
  `users`                             Comptes, identifiants et rôles

  `companies`                         Entreprises clientes

  `company_members`                   Utilisateurs rattachés aux
                                      entreprises

  `watch_preferences`                 Secteurs, mots-clés, exclusions et
                                      critères

  `sources`                           Registre des sites surveillés

  `source_runs`                       Historique des collectes

  `tenders`                           Annonces centralisées et
                                      dédupliquées

  `tender_documents`                  Documents associés

  `tender_matches`                    Correspondance annonce/entreprise,
                                      score et justification

  `saved_tenders`                     Favoris et suivi

  `notifications`                     Historique des e-mails

  `audit_logs`                        Événements administratifs
                                      importants
  -----------------------------------------------------------------------

### Isolation multi-tenant obligatoire

-   Toute donnée appartenant à une entreprise doit être liée à son
    `company_id`.
-   Vérifier les permissions côté serveur pour chaque accès.
-   Un membre de l'entreprise A ne doit jamais lire ou modifier les
    données de l'entreprise B en changeant un identifiant d'URL/API.
-   Tester automatiquement l'isolation entre deux entreprises.
-   Les annonces sont partagées ; les préférences, matches, favoris et
    notifications sont cloisonnés.

## 8. API métier indicative

``` text
POST   /auth/register
POST   /auth/login
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /me

GET    /company
PATCH  /company
GET    /company/members
POST   /company/members

GET    /watch-preferences
POST   /watch-preferences
PATCH  /watch-preferences/:id

GET    /tenders
GET    /tenders/:id
POST   /tenders/:id/favorite
PATCH  /tenders/:id/status

GET    /notifications
GET    /dashboard/summary

GET    /admin/companies
GET    /admin/sources
POST   /admin/sources
POST   /admin/sources/:id/run
GET    /admin/source-runs
GET    /admin/notifications
```

Les routes d'administration doivent exiger le rôle approprié.

## 9. Sécurité et fiabilité

-   Secrets côté serveur uniquement ; `.env` exclu de Git.
-   Validation des entrées, limitation de débit et gestion sécurisée des
    sessions.
-   Contrôle d'accès multi-tenant sur toutes les routes.
-   Sauvegardes PostgreSQL et procédure de restauration.
-   Journaux sans secrets ni données sensibles inutiles.
-   Politique de conservation des PDF à définir.
-   Respect des conditions d'accès aux sources.
-   Reprises sur erreur, déduplication et surveillance des connecteurs.

Distinguer dans l'interface d'administration : - collecte réussie,
nouvelles annonces détectées ; - collecte réussie, aucune nouvelle
annonce ; - collecte échouée ou source indisponible.

Une panne ne doit jamais être présentée au client comme une journée sans
nouvel appel d'offres.

## 10. Variables d'environnement

Créer `.env.example` avec des valeurs fictives uniquement :

``` dotenv
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

API_PORT=4000
API_BASE_URL=http://localhost:4000
JWT_SECRET=replace_me
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tender_watch
REDIS_URL=redis://localhost:6379

OPENAI_API_KEY=
OPENAI_MODEL=

EMAIL_PROVIDER=
EMAIL_API_KEY=
EMAIL_FROM_NAME=SRC Digital
EMAIL_FROM_ADDRESS=

TENDER_SCAN_CRON=0 7 * * *
TENDER_TIMEZONE=Africa/Ouagadougou

S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

Adapter les variables au choix technique final. Ne jamais committer de
vrai secret.

## 11. Planning et deadlines de référence

  -----------------------------------------------------------------------
  Période                 Étape                   Livrable
  ----------------------- ----------------------- -----------------------
  2--6 novembre 2026      Cadrage et audit des    Architecture,
                          sources                 maquettes, modèle de
                                                  données et sources
                                                  prioritaires

  9--13 novembre          Socle SaaS              Authentification,
                                                  entreprises, profils et
                                                  préférences

  16--20 novembre         Collecte                Premiers connecteurs,
                                                  extraction HTML/PDF,
                                                  normalisation et
                                                  déduplication

  23--27 novembre         IA                      OpenAI, extraction
                                                  structurée,
                                                  classification, résumé
                                                  et matching

  30 novembre--4 décembre Automatisation          Scheduler, e-mails
                                                  personnalisés et
                                                  dashboard

  7--11 décembre          Tests et sécurité       Tests fonctionnels,
                                                  multi-tenant, qualité
                                                  et délivrabilité

  14--18 décembre         Recette et pilote       Corrections,
                                                  déploiement et test
                                                  avec entreprises
                                                  pilotes
  -----------------------------------------------------------------------

**Deadline MVP prévisionnelle : vendredi 18 décembre 2026.**

Cette date suppose un développeur principalement dédié, un périmètre
limité au Burkina Faso, l'accès aux sources prioritaires et la
disponibilité des clés API/services e-mail. Réévaluer le délai après
l'audit des sources.

## 12. Critères d'acceptation du MVP

Le MVP est considéré comme livrable lorsque : 1. Une entreprise peut
s'inscrire, vérifier son e-mail et compléter son profil. 2. Elle
configure ses secteurs et mots-clés. 3. Au moins un connecteur validé
récupère une annonce réelle d'une source burkinabè. 4. L'annonce est
extraite, normalisée et enregistrée sans inventer les champs absents. 5.
OpenAI produit une classification et un résumé structurés. 6. Le
matching relie l'annonce aux entreprises pertinentes. 7. Une entreprise
ne reçoit que ses propres correspondances. 8. Le digest quotidien part à
l'heure configurée. 9. Les annonces et leurs sources sont consultables
dans le dashboard. 10. Les doublons et renvois répétitifs sont évités.
11. Les erreurs de collecte et d'e-mail sont visibles par
l'administrateur. 12. Les tests prouvent l'isolation des données entre
entreprises.

## 13. Première mission de Claude Code

**Ne commence pas par coder toute l'application d'un seul coup.**

1.  Inspecter le dépôt et décrire son état.
2.  Identifier les frameworks, conventions et dépendances existants.
3.  Proposer une architecture concrète adaptée au dépôt.
4.  Auditer la DGCMEF en priorité : pages de publications, bulletins
    PDF, formats, accès public et conditions d'accès. Vérifier les
    autres sources ensuite.
5.  Définir le modèle de données détaillé et les contrats NestJS ↔
    collecteur Python.
6.  Présenter un plan de petites étapes et les décisions nécessitant
    validation.
7.  Après cadrage, développer le socle, puis chaque module séparément
    avec tests.

**Instruction finale :** construire d'abord un produit fiable. La
priorité de SRC Digital est de fournir aux entreprises burkinabè des
appels d'offres réels, correctement extraits, vérifiables et pertinents
--- pas simplement des résumés générés par IA.
