# Perturbations Tisséo

`build_disruptions.py` lit le flux temps réel ouvert de Tisséo (GTFS-RT, licence ODbL, sans clé :
alertes + trajets annulés) et l'offre théorique GTFS, puis rattache chaque perturbation des lignes
structurantes (métro, tram, Téléo, Linéo) aux quartiers qu'elles desservent.

```bash
pip install -r requirements.txt
curl -o GtfsRt.pb https://api.tisseo.fr/opendata/gtfsrt/GtfsRt.pb
# GTFS théorique : jeu « Tisséo » de transport.data.gouv.fr (lien de téléchargement redirigé vers data.toulouse-metropole.fr)
python3 build_disruptions.py --gtfs <dossier GTFS> --rt GtfsRt.pb --quartiers ../zones/gq.geojson \
  --out ../../apps/mobile/src/data/zones/tisseo-perturbations.json
```

- Impact par mode (hypothèse) : métro 1, tram 0,7, Téléo 0,4, Linéo 0,3, bus 0,1.
- Le flux est un instantané : à rafraîchir toutes les quelques minutes côté serveur.
- Le flux public peut être instable (jeu en bêta). L'API REST complète de Tisséo demande une clé
  (opendata@tisseo.fr) : pas nécessaire pour l'instant.
