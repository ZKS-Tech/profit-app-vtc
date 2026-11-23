# Arrivées en gare (SNCF)

Extrait les arrivées planifiées d'une gare depuis le GTFS national SNCF
([transport.data.gouv.fr](https://transport.data.gouv.fr/datasets/horaires-sncf), licence ODbL)
et écrit un JSON par jour pour l'app (`apps/mobile/src/data/arrivals/`).

```bash
curl -L -o gtfs.zip https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip
unzip gtfs.zip -d gtfs
python3 build_arrivals.py --gtfs gtfs --dates 2026-11-24,2026-12-01 \
  --station 87611004 --name "Toulouse Matabiau" --slug matabiau \
  --out-dir ../../apps/mobile/src/data/arrivals
```

- Horaires théoriques (mis à jour par la SNCF environ tous les 2 mois) ; retards GTFS-RT : à venir.
- Les trains arrivant après minuit sont rattachés au bon jour.
- `capacity` = capacité indicative par type de train (hypothèse), pas l'occupation réelle.
- Code UIC : Toulouse Matabiau 87611004, Montauban Ville Bourbon 87611244.
