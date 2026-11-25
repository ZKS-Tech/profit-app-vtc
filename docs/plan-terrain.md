# Plan : rendre l'app fonctionnelle et la tester avec Fabrice

**Mise à jour du 23/11/2026.** Le plan est recentré sur les **gares, l'aéroport et les grands lieux d'affluence de Toulouse**.

## Le cap

- **À long terme :** une app utilisable par tout chauffeur (taxi, VTC privé, Uber, Bolt…).
- **D'abord :** prévoir **quand et où des voyageurs arrivent en masse** à Toulouse (gare Matabiau, aéroport de Blagnac, gare routière, MEETT, stades et salles), et donc où des clients vont chercher un transport.

C'est le bon point de départ pour trois raisons :
1. **Ces signaux sont publics et ne dépendent d'aucune plateforme.** Ils servent aussi bien un taxi qu'un chauffeur Uber, et ne demandent aucune API Uber.
2. **Ils sont planifiés à l'avance** (horaires de trains, vols, calendrier des événements). On peut donc prévoir des pics précis, pas seulement des moyennes.
3. **L'historique de Fabrice sert à les calibrer.** Il a 2 ans de courses Uber et Bolt : on vérifie quels pics d'arrivées produisent réellement des courses, et avec quel délai.

---

## L'API Uber est-elle indispensable ? Non.

- **Ce qu'elle donne :** uniquement le profil, l'historique des courses et les paiements **du chauffeur connecté**. Elle ne donne ni la demande, ni la carte de chaleur, ni la file d'attente de l'aéroport.
- **Comment on l'obtient :** l'accès est limité. On le demande sur la page produit Drivers d'Uber. Pour ouvrir l'app au public, Uber doit valider l'application **terminée** (vidéo ou captures à l'appui). Avant cette validation, seuls les développeurs et des testeurs invités peuvent l'utiliser.
- **Ce qu'on fait à la place :** les **exports de données** de Fabrice contiennent la même chose. Côté Uber, c'est le « Télécharger mes données » de myprivacy.uber.com (une archive .zip, en 24 à 72 h environ) ; côté Bolt, c'est une demande d'accès RGPD.
- **Quand la demander :** plus tard, pour la commercialisation, afin d'éviter aux chauffeurs l'import manuel. Uber exige de toute façon une app terminée.

---

## Le modèle « affluence » (cœur de la v1)

Pour chaque **lieu** et chaque **tranche de 15 min** :

1. **Arrivées prévues :** trains, vols et cars qui arrivent, pondérés par leur capacité. Un TGV pèse plus qu'un TER, un A321 plus qu'un ATR.
2. **Délai de sortie :** les voyageurs sortent environ 5 à 15 min après l'arrivée d'un train, 20 à 40 min après l'atterrissage d'un vol (bagages). Ces délais seront calibrés sur les données.
3. **Facteurs qui augmentent la demande :** arrivées tardives après la fin des transports en commun, grève ou perturbation des transports, pluie, gros événement, vacances (Toulouse est en zone C), lundi matin et vendredi soir.
4. **Calibrage avec l'historique de Fabrice :** on compare ses prises en charge à Matabiau et à Blagnac aux arrivées des 45 minutes précédentes. On en tire le nombre de courses attendues et le temps d'attente probable, par lieu et par créneau.

**Résultat affiché :** une frise des **pics des 3 prochaines heures** par lieu. Par exemple : « Matabiau : pic 9h40–10h10, 3 TGV, forte affluence ». L'app indique aussi la confiance et la source.

**Limites connues :**
- L'historique de Fabrice montre où **il** a pris des clients, pas toute la demande de la ville. Pour estimer correctement l'attente, il faut aussi savoir combien de temps il est resté sur place. Ça passera par le GPS consenti pendant le pilote.
- La file d'attente des chauffeurs à l'aéroport n'est pas visible. Les retours de Fabrice serviront d'indicateur.

---

## Sources de données (premier repérage, à confirmer)

| Lieu ou signal | Source | Accès | Statut |
|---|---|---|---|
| **Trains** (TGV, Intercités, TER, OUIGO) à Matabiau | Jeu national SNCF « Horaires SNCF » (GTFS), plus le temps réel (GTFS-RT) pour les retards | Open data, mis à jour tous les 2 mois | Licence à vérifier ressource par ressource (ODbL ou attribution) |
| **Cars longue distance** (gare routière Pierre-Sémard) | Données GTFS des opérateurs sur transport.data.gouv.fr | Open data | À vérifier |
| **Vols** à Blagnac | Aucun flux ouvert officiel trouvé. API payantes : Aviation Edge, FlightAware AeroAPI, Flightradar24 | Payant | Prix à comparer. **Pas de collecte automatique** sur le site de l'aéroport (règle du cahier des charges). |
| **Saisonnalité aéroport** | Bilans de trafic publiés par l'aéroport (PDF) | Public | Suffisant pour la v0 |
| **Événements** (Stadium, Ernest-Wallon, Zénith, MEETT, Halle aux Grains…) | Pas d'API unique trouvée. Quelques agendas OpenAgenda et les calendriers des salles | Mixte | v0 : un **calendrier tenu à la main** des gros événements |
| **Jours fériés, vacances scolaires** | Données officielles de l'État | Open data | Simple |
| **Météo** | Météo-France (données publiques) | Open data | Licence à vérifier |
| **Historique de Fabrice** | Exports Uber et Bolt (RGPD) | À demander **maintenant** | Inconnue : l'export Uber contient-il les coordonnées des prises en charge ? |

---

## Déroulé (environ 10 semaines)

| Phase | Semaines | Contenu | Fabrice |
|---|---|---|---|
| **0. Démarrage** | S1 | Demander les exports Uber et Bolt. Vérifier les licences. Choisir l'API de vols (essai gratuit si possible). Fixer les critères de réussite. | Lance ses demandes d'export, signe le consentement |
| **1. Arrivées** | S2–S3 | Chaîne d'import des trains, cars, vols et calendrier. Calcul des arrivées par lieu et par tranche de 15 min. **Écran « Arrivées »** branché sur de vraies données. | Regarde l'écran et dit si les pics correspondent à ce qu'il vit |
| **2. Calibrage** | S3–S5 | Import de ses 2 ans d'historique, repérage des prises en charge aux gares et à l'aéroport, calibrage du modèle, **test sur le passé** (les 3 derniers mois mis de côté) | Échange d'une heure sur ses habitudes : quand il va à la gare, à l'aéroport, et pourquoi |
| **3. Pilote Android** | S6–S9 | App installée en test interne Google Play. Frise des pics et alertes vocales. GPS consenti pour mesurer les attentes. Journal « suivi / pas suivi ». | Roule avec l'app. Point de 20 min par semaine. |
| **4. Bilan** | S10 | Résultats chiffrés et décision sur la suite : autres lieux, autres chauffeurs, taxis | Entretien final |

Ensuite seulement : recommandations par zone de ville, multi-plateforme complet, autres villes.

---

## Critères de réussite (proposition)

| Mesure | Seuil proposé |
|---|---|
| Arrivées de trains : comparaison avec les horaires affichés en gare | > 98 % de concordance |
| Pics prévus et pics vécus par Fabrice | Majoritairement confirmés lors des points hebdomadaires |
| Courses prévues et courses réelles par créneau aux gares et à l'aéroport (test sur le passé) | Écart à fixer après la phase 2 |
| Temps d'attente moyen à Matabiau et Blagnac : pilote vs historique | En baisse, sans promesse chiffrée |
| Batterie ajoutée par jour / plantages | < 10 % / 0 perte de données |

⚠️ Un seul chauffeur sur quelques semaines : une amélioration constatée est un **signal**, pas une preuve.

---

## Budget à prévoir

- Google Play Console : 25 $ une fois.
- API de vols : probablement **le premier poste payant**, à chiffrer.
- Supabase : offre gratuite au départ.
- Fond de carte et météo : offres gratuites probablement suffisantes pour le pilote.

## À faire cette semaine

1. **Fabrice** : demander l'export « Télécharger mes données » sur myprivacy.uber.com, et l'export de ses données Bolt.
2. **Vous** : valider la liste des lieux (Matabiau, Blagnac, gare routière, MEETT, stades et salles…) et les critères de réussite.
3. **Développement** : vérifier les licences SNCF et les prix des API de vols, puis lancer la chaîne d'import des trains, la source la plus simple et la plus fiable.

## Boucle quotidienne de test

Objectif : améliorer la précision de la carte jour après jour, sur l'indicateur qui compte pour le chauffeur,
**les € par heure mobilisée** (montant ÷ (attente + course)), pas seulement l'attente : une zone avec une longue
attente peut rester rentable si les courses y sont mieux payées (aéroport, Blagnac).

1. **Fabrice, pendant le service** : « Début de service » une fois, puis « Course acceptée » et « Fin de course »
   avec le montant. « Fin de service » seulement pour une vraie pause (un arrêt de moins de 45 min est compté
   comme de l'attente). Un avis sur la carte en fin de journée suffit.
2. **Le soir** : Journal → Partager le CSV, envoyé avec une ligne de contexte (pause, file aéroport, incident).
3. **Évaluation** : `cd apps/mobile && npm run evaluer -- journal-*.csv` (tous les jours cumulés). Le script
   compare, course par course, le rang de la zone dans la version du jour et dans le modèle actuel au €/h réel.
4. **Décision** : on ne change les poids que si la variante fait mieux sur l'ensemble des jours cumulés
   (≥ 50 courses), pas sur une seule journée.

Les journaux contiennent des montants et des positions : ils restent hors du dépôt (public), dossier `terrain/`
ignoré par git.
