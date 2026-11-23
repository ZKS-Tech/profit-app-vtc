# Vols de Toulouse-Blagnac (TLS / LFBO)

Connecteur serveur vers l'API officielle d'Aéroport Toulouse-Blagnac (ATB) et estimation des
voyageurs sortant de l'aérogare par tranche de 30 minutes.

**État au 23/11/2026 : prêt mais non connecté.** L'API exige une autorisation que nous n'avons pas.
Aucune donnée de vol n'est simulée ni affichée dans l'app.

## Ce qui a été vérifié sur l'API ATB

| Point | Constat |
|---|---|
| Documentation | Publique : `https://api.toulouse.aeroport.fr/index.html?ui=re_doc` (API Platform, OpenAPI 3.1, « ATB API Platform » v1.1.0) |
| Routes utiles | `GET /planned-arrivals`, `/realtime-arrivals`, `/planned-departures`, `/realtime-departures` |
| Paramètres | `startDate`, `endDate` (AAAA-MM-JJ, par défaut aujourd'hui → demain), `page`, `limit` (max 300), `sortBy=dateheurevol`, `order` |
| Authentification | Obligatoire sur toutes les routes (`401 Full authentication is required` sans jeton). Jeton OAuth2 Keycloak en `client_credentials` (client confidentiel + secret), envoyé en `Authorization: Bearer` |
| Obtention d'une clé | **Aucune procédure publique.** L'URL du serveur de jetons n'est pas publiée. |
| Gratuité, quotas | **Non documentés.** |
| Usage commercial | **Non documenté.** La page « API mentions légales » du site concerne l'application mobile de l'aéroport, pas un programme pour développeurs tiers. |
| Champs des réponses | **Non documentés** : le schéma OpenAPI ne décrit que `id`. Les horaires prévus / estimés / réels ne sont donc pas confirmés. |
| Autres routes | L'API sert aussi l'app et le site d'ATB (comptes, réservations, parkings, `waiting-times`, `affluences`). Il s'agit vraisemblablement de l'API interne d'ATB, pas d'une offre open data. |

➡️ Il faut **demander un accès à ATB** (Espace Professionnels du site, ou webmaster@toulouse.aeroport.fr) en
précisant l'usage : affichage des arrivées et départs à des chauffeurs taxi/VTC, sans revente des données.
Demander aussi les conditions (gratuité, quotas, usage commercial, mentions obligatoires) et un exemple de réponse.

**Ne jamais** extraire un jeton de l'application mobile ou du site d'ATB, ni collecter automatiquement les pages
« Infos vols » : ce serait contraire au cahier des charges et probablement aux conditions d'utilisation.

## Alternatives examinées (aucune souscrite)

| Source | Gratuit ? | Usage commercial | Remarque |
|---|---|---|---|
| Aviationstack | 100 requêtes/mois | **Non** (offre gratuite réservée à un usage non commercial) | HTTP seulement en gratuit : la clé circulerait en clair. Payant ensuite. |
| OpenSky Network | Oui | **Non** sans accord écrit | Données ADS-B ; les arrivées par aéroport sont calculées après coup (historique), pas de programme futur. |
| AeroDataBox | Petit quota gratuit (via RapidAPI) | À vérifier | Tarifs et conditions à lire sur la place de marché. |
| FlightAware AeroAPI, Aviation Edge, Flightradar24 | Non ou très limité | Payant | Hors budget actuel. |

**Recommandation :** obtenir l'accès officiel ATB (source primaire, la plus juste pour Toulouse). Aucune solution
gratuite n'autorise un usage commercial sans accord.

## Configuration (côté serveur uniquement)

Les secrets ne doivent **jamais** être intégrés à l'app mobile.

| Variable | Rôle |
|---|---|
| `ATB_TOKEN_URL` | URL du serveur de jetons Keycloak, fournie par ATB |
| `ATB_CLIENT_ID` / `ATB_CLIENT_SECRET` | Identifiants du client, fournis par ATB |
| `ATB_API_BASE` | Facultatif, par défaut `https://api.toulouse.aeroport.fr` |
| `ATB_CACHE_DIR` | Facultatif, cache local des réponses (non versionné) |

```bash
python3 build_airport_flights.py --check          # état de la configuration, sans appel réseau
python3 build_airport_flights.py --date 2026-11-24 --days 2 --out-dir ../../apps/mobile/src/data/arrivals
python3 -m unittest discover -s tests             # tests de la logique
```

Au premier appel réussi, si `field_map.json` n'existe pas, le script enregistre un échantillon de la vraie réponse
(`.cache/echantillon-reponse.json`) et s'arrête. Il faut alors copier `field_map.example.json` en `field_map.json`
et y indiquer quels champs de l'API contiennent le numéro de vol, les heures prévue, estimée et réelle, le statut,
la provenance et le type d'avion.

## Fonctionnement

- `atb_client.py` : jeton OAuth2 (renouvelé avant expiration), pagination (300 par page), cache disque (6 h pour le
  programme, 2 min pour le temps réel).
- `flights.py` : modèle normalisé `FlightMovement` (arrivée ou départ, heures programmée / estimée / réelle en heure
  de Paris, retard, annulation), dédoublonnage par vol + sens + horaire programmé (le temps réel l'emporte).
- `passenger_flow.py` : par tranche de 30 min, avions qui atterrissent, départs, annulations, **voyageurs estimés en
  sortie**, niveau de confiance et pics.

### Hypothèses de l'estimation (aussi recopiées dans chaque fichier produit)

- Sièges : selon le type d'avion s'il est connu, sinon 180 (famille A320).
- Remplissage moyen : 80 %.
- Sortie après l'atterrissage : 15–35 min (Schengen), 30–60 min (hors Schengen, contrôle aux frontières),
  15–45 min si la provenance est inconnue ; sorties réparties uniformément sur la fenêtre.
- Confiance : élevée avec une heure réelle ou estimée et un type d'avion connu, faible sur le seul programme.
- Pic : au moins 300 voyageurs sortants et au moins 1,5 × la médiane des tranches non vides.

⚠️ **Voyageurs ≠ courses VTC.** Le champ `vtcRides` reste vide. La part modale taxi/VTC, l'attente dans la file,
la concurrence entre chauffeurs, les km à vide et la rentabilité (`future.*`) seront calibrés avec l'historique de
Fabrice et le pilote terrain.
