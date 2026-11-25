# Découpage de Toulouse en zones

`build_zones.py` transforme les 60 grands quartiers INSEE de Toulouse
([Toulouse Métropole](https://data.toulouse-metropole.fr/explore/dataset/recensement-population-2019-grands-quartiers-population/),
Licence Ouverte v2.0) en tracés SVG simplifiés pour la carte de l'app, avec population 2019, densité
et position des pôles de transport (gare Matabiau, gare routière, aéroport).

```bash
curl -o gq.geojson "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/recensement-population-2019-grands-quartiers-population/exports/geojson"
python3 build_zones.py --geojson gq.geojson --out ../../apps/mobile/src/data/zones/toulouse-zones.json
```

L'aéroport est hors de la commune de Toulouse : il est affiché à part.

## Activité par zone et calendrier

`build_activity.py` compte, pour chaque zone, les emplois (base SIRENE de Toulouse Métropole, milieu de la
tranche d'effectif, Licence Ouverte) et les lieux qui génèrent des courses (OpenStreetMap via Overpass, ODbL) :
hôtels, santé, études, centres commerciaux, vie nocturne, salles et stades. Hors Métropole (Sicoval…), les
emplois sont estimés d'après la population et listés dans `emploisEstimes`.

`build_calendar.py` récupère les vacances scolaires de l'académie de Toulouse (data.education.gouv.fr) et
calcule les jours fériés.

```bash
curl -o employeurs.json "https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/base-sirene-v3/exports/json?where=etatadministratifetablissement%3D%22A%22%20and%20trancheeffectifsetablissementtriable%3E0&select=codecommuneetablissement,geolocetablissement,trancheeffectifsetablissementtriable"
curl -o poi.json --data-urlencode "data@poi.overpassql" https://overpass-api.de/api/interpreter
python3 build_activity.py --zones ../../apps/mobile/src/data/zones/toulouse-zones.json --quartiers gq.geojson \
  --communes communes31.geojson --sirene employeurs.json --osm poi.json --out ../../apps/mobile/src/data/zones/activite.json
python3 build_calendar.py --out ../../apps/mobile/src/data/zones/calendrier.json
```

Dans l'app (`src/domain/activity.ts`), chaque catégorie suit un profil horaire selon le type de jour
(semaine, samedi, dimanche ou férié, vacances). Ces profils sont des hypothèses à calibrer avec l'historique
de courses.
