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

## Cars longue distance (FlixBus, BlaBlaCar Bus)

```bash
curl -L -o flix.zip https://gtfs.gis.flix.tech/gtfs_generic_eu.zip            # FlixBus (horaires en UTC)
curl -L -o blabla.zip "https://drive.google.com/uc?export=download&id=1VXd01yQl2Mb67C9bkrx0P8sqNIL532_o"
python3 build_coach_arrivals.py \
  --feed "FlixBus:flix:dcc0e74b-9603-11e6-9066-549f350fcb0c" \
  --feed "BlaBlaCar Bus:blabla:XTS" \
  --dates 2026-11-24,2026-12-01 --name "Gare routière Pierre-Sémard" \
  --slug gare-routiere --out-dir ../../apps/mobile/src/data/arrivals
```

- Liens de téléchargement publiés sur transport.data.gouv.fr (jeux « Réseau européen FlixBus et FlixTrain »
  et « Réseau européen BlaBlaCar Bus », licence ODbL).
- Les heures sont converties en heure de Paris (FlixBus publie en UTC) : conversion à confirmer sur le terrain.
- Arrêts à l'aéroport également disponibles : FlixBus `7f44b7dd-da4d-4e7e-a3a2-ef0356ee358f`, BlaBlaCar `TLA`.
