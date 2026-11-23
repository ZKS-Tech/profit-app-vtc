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
