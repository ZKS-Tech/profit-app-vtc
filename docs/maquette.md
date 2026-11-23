# Maquette — périmètre et points à valider

Maquette fonctionnelle de l'app mobile (`apps/mobile`), construite en composants réutilisables.
**Toutes les valeurs sont fictives** (`src/demo/data.ts`) ; aucune n'est une prévision ni une donnée Uber.

## Écrans

| Onglet | Contenu | Réf. cahier |
|---|---|---|
| Accueil | État « Disponible / En course » déclaré par le chauffeur, recommandation (zone, revenu net estimé et fourchette, objectif, raison, calcul rester/bouger, confiance, provenance), autres options, prochain créneau, indicateurs du jour | §8, §22.1 |
| Carte | Carte schématique de Toulouse, horizons Maintenant/+15/+30/+60 min, couleur par rapport à l'objectif, détail de zone avec temps et coût d'accès et gain net sur 1h30 | §8, §25 |
| Planification | Jour, scénario prudent/médian/optimiste, total estimé, contraintes (départ, fin, course privée bloquée), créneaux, signaux externes | §7, §22.3 |
| Stats | Semaine/mois : CA, après commission, après coûts variables, €/h net, heures comptées une fois, km à vide, réel vs prévu, rendement par plateforme et par zone | §10, §22.5 |
| Profil | Plateformes, horaires, véhicule, coûts, objectif (modifiable, recolore la carte), préférences, notifications, consentements, export/suppression | §6, §22.2 |
| Connexions | Statut par plateforme (import disponible, OAuth en attente…), date de synchro, champs importés | §12–13, §22.4 |

**Outil de maquette** (en haut du Profil) : simuler les états *chargement*, *peu de données* et *hors ligne*.

## Calcul illustré (rester ou bouger)
`src/domain/decision.ts` compare sur 1h30 :
- rester = revenu net/h de la zone actuelle × 1,5 ;
- bouger = revenu net/h de la zone cible × (1h30 − temps d'accès) − coût du trajet.
Une zone n'est recommandée que si le gain dépasse 2 €.

## Points à valider
1. Organisation des 5 onglets et contenu de l'accueil.
2. Formulation des recommandations et niveau de détail du « Pourquoi ».
3. Indicateurs de l'écran Stats (et ordre d'affichage).
4. Horizon de comparaison (1h30) et seuil de gain (2 €).
5. Paramètres du profil manquants ou superflus.
6. Carte : la carte schématique sera remplacée par un vrai fond de carte (prestataire à choisir).
