# Plan : de la maquette au test terrain avec Fabrice

**Objectif :** mesurer la fiabilité de VTC Profit AI en conditions réelles, à Toulouse, avec Fabrice.
On vérifie trois choses, dans cet ordre :

1. **Les chiffres sont justes** : revenus, heures, km à vide calculés par l'app = réalité.
2. **Les prévisions sont fiables** : le revenu estimé par zone et créneau est proche du revenu réel.
3. **Les recommandations sont utiles** : les suivre améliore le revenu net par heure.

On ne peut pas tester 2 et 3 sans 1. Le plan suit donc cet ordre.

---

## Vue d'ensemble (≈ 12 semaines)

| Phase | Semaines | Ce que Fabrice fait | Résultat |
|---|---|---|---|
| 0. Préparation | S1 | Fournit ses exports Uber, signe le consentement | Données auditées, critères de réussite fixés |
| 1. Socle données | S2–S3 | Rien de nouveau | Import, calculs et écran Stats sur ses vraies données |
| 2. Collecte de référence | S4–S6 | Roule normalement avec l'app en mode « journal » | 3 semaines de données complètes, **sans** recommandation |
| 3. Moteur de prévision | S5–S7 (en parallèle) | Rien | Prévisions testées sur le passé avant d'être montrées |
| 4. Pilote avec recommandations | S8–S11 | Utilise Accueil, Carte, Planification | Mesure de l'utilité réelle |
| 5. Bilan | S12 | Entretien final | Décision : continuer, corriger ou arrêter |

---

## Phase 0 : préparation (S1)

**Données**
- Récupérer les relevés Uber de Fabrice sur plusieurs mois. Deux sources sont possibles :
  - les relevés de paiement et d'activité du portail chauffeur ;
  - la demande d'accès RGPD « Télécharger mes données » d'Uber. Elle peut contenir plus de détails sur les courses, à vérifier.
- Faire l'audit : champs disponibles, unités, niveau de détail géographique (ville seulement ou coordonnées ?), horodatages, frais et bonus.
- Lister ce qui manque. C'est ce qui décidera de la place du GPS dans la phase 2.

**Cadre**
- Consentement écrit de Fabrice : ce qui est collecté (GPS pendant l'activité, relevés), pourquoi, combien de temps c'est conservé, comment tout supprimer.
- **Fixer les critères de réussite avant le test**, pas après (voir la fin du document).
- Déposer en parallèle la demande d'accès à l'API Uber Driver. C'est long et incertain : on ne compte pas dessus.

**Équipement**
- Système du téléphone de Fabrice (iOS ou Android) : décide par quelle plateforme on commence.
- Comptes de distribution : Apple Developer (99 $/an) pour TestFlight, ou Google Play Console (25 $ une fois) pour le test interne.

## Phase 1 : socle données (S2–S3)

- Base de données Supabase hébergée en UE : PostgreSQL + PostGIS, comptes utilisateurs, séparation stricte des données par chauffeur (RLS).
- **Import CSV/Excel** des relevés Uber : correspondance des colonnes, conversion des unités, dédoublonnage, provenance de chaque ligne.
- Saisie des **courses privées** dans l'app.
- **Moteur de calcul** avec tests automatiques : sessions, heures comptées une seule fois, revenu après commission, revenu après coûts variables, €/h, km à vide.
- Brancher l'écran **Stats** sur ces vraies données.

**Contrôle :** on compare les totaux de l'app avec les relevés de paiement Uber de Fabrice, semaine par semaine. Tant que l'écart dépasse 1 %, on corrige avant d'aller plus loin.

## Phase 2 : collecte de référence (S4–S6)

Fabrice roule **comme d'habitude**. L'app ne recommande rien, elle enregistre seulement.

- **Build installable** (TestFlight ou Play test interne), pas Expo Go : le GPS en arrière-plan l'exige.
- **GPS en arrière-plan**, uniquement entre « Début de journée » et « Fin de journée ». La fréquence est réglée pour limiter la batterie.
- **Le moins de manipulations possible.** Fabrice appuie seulement sur Début et Fin de journée, à l'arrêt. Les phases de course, d'approche, d'attente et de km à vide sont reconstituées **après coup**, en croisant la trace GPS avec les horaires des courses du relevé Uber. On ne lui demande rien pendant la conduite.
- **Contrôle qualité quotidien et automatique :** part des courses retrouvées sur la trace GPS, trous de GPS, journées incomplètes, batterie consommée.
- **Point de 15 minutes avec Fabrice chaque semaine :** problèmes rencontrés, journées atypiques (panne, événement…).

Ces 3 semaines servent deux fois : comme **période de référence** pour comparer ensuite, et comme **données d'apprentissage** pour le moteur.

## Phase 3 : moteur de prévision v0 (S5–S7, en parallèle)

- **Découpage en zones :** commencer simple, une dizaine de zones (Centre, Nord, Sud, Est, Ouest, aéroport, gare, Montauban, Lavaur…). On affine ensuite si les données le permettent.
- **Modèle de base :** moyenne du revenu net par heure par zone × jour × créneau de 30 min. Quand une case a peu d'observations, on la rapproche de la moyenne de la ville (lissage), et la **confiance** affichée dépend du nombre d'observations.
- **Signaux externes v0, limités :** jours fériés et vacances scolaires, météo. Les trains, vols et événements viennent ensuite, après vérification de leurs licences.
- **Test sur le passé avant d'afficher quoi que ce soit :** on prédit des journées déjà roulées avec les seules données antérieures, puis on mesure l'erreur. Si l'erreur est trop forte, on n'active pas les recommandations.

**Limite à assumer :** avec un seul chauffeur, environ 80 courses par semaine, beaucoup de cases zone × créneau resteront vides. Les prévisions v0 seront donc prudentes, et c'est voulu : la confiance affichée doit le dire.

## Phase 4 : pilote avec recommandations (S8–S11)

- On active l'Accueil (recommandation rester/bouger), la Carte et la Planification.
- **Alerte vocale seulement** pendant l'activité, et seulement si le gain estimé dépasse le seuil. Aucune action demandée en conduisant.
- **Journal des décisions :** pour chaque recommandation, on enregistre si Fabrice l'a suivie, déduit du GPS, et pourquoi pas sinon (un choix rapide en fin de journée, pas au volant).
- **Protocole de comparaison :** alterner des jours « avec » et « sans » recommandations, sur des jours et créneaux comparables, en notant météo et événements.
- **Point hebdomadaire de 30 minutes avec Fabrice :** clarté des recommandations, confiance, gêne, batterie.

## Phase 5 : bilan (S12)

Rapport chiffré (critères ci-dessous), entretien final avec Fabrice, liste des corrections, puis décision pour la suite : bêta avec d'autres chauffeurs, multi-plateforme, ou corrections d'abord.

---

## Critères de réussite (à valider en phase 0)

| Ce qu'on teste | Mesure | Seuil proposé |
|---|---|---|
| Justesse des calculs | Écart revenus app / relevés Uber | < 1 % |
| Qualité des données | Courses retrouvées sur la trace GPS | ≥ 95 % |
| | Journées GPS complètes | ≥ 90 % |
| Prévision | Erreur médiane sur le revenu net/h d'un créneau | à fixer après la phase 2 |
| | Le réel tombe dans la fourchette affichée | ≈ 80 % du temps |
| Utilité | Revenu net/h et km à vide/h : jours « avec » vs « sans » et vs période de référence | à mesurer, sans promesse |
| Usage | Batterie ajoutée par jour, plantages | < 10 %, 0 perte de données |
| Ressenti | Recommandations claires et jugées utiles par Fabrice | entretien |

⚠️ Avec un seul chauffeur sur quelques semaines, une amélioration du revenu est **un signal, pas une preuve**. On ne s'en sert pas comme argument commercial à ce stade.

---

## Rôles

- **Vous :** pilotage, lien avec Fabrice, validation des critères et des choix (carte, budget).
- **Evan :** développement et tests. Claude Code peut produire une grande partie du code sous sa revue.
- **Fabrice :** terrain, retours hebdomadaires, exports Uber.

## Budget mensuel indicatif pendant le test

Supabase (offre gratuite au départ, environ 25 $/mois ensuite), compte Apple ou Google, fond de carte (offre gratuite des principaux fournisseurs probablement suffisante pour un seul utilisateur), météo (sources ouvertes). À confirmer quand le fournisseur de cartes sera choisi.

## Décisions à prendre maintenant

1. Téléphone de Fabrice : iOS ou Android ?
2. Date de début de la collecte terrain.
3. Exports Uber disponibles : lesquels, sur quelle période ?
4. Lancer dès maintenant la demande d'accès API Uber (en parallèle, sans en dépendre) ?
5. Valider les critères de réussite du tableau ci-dessus.
