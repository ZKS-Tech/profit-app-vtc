# Météo de Toulouse (Météo-France)

`build_weather.py` récupère :
- la dernière **observation horaire** de la station Toulouse-Blagnac (API Données d'observation v2) ;
- la **pluie prévue heure par heure** sur Toulouse (API Modèle AROME 1.0, cumul sur 1 h, grille 0,01°),
  sur la dernière exécution publiée du modèle (environ 2 jours d'échéance).

Données Météo-France sous Licence Ouverte v2.0 : citer « Météo-France » comme source.

## Clé d'accès

Compte gratuit sur [portail-api.meteofrance.fr](https://portail-api.meteofrance.fr) avec souscription à
« Données d'observation » (v2) et « Modèle AROME ». Une seule clé de type **API Key** (DefaultApplication)
sert pour les deux API. Abonnements valables jusqu'au 24/11/2028, à renouveler sur le portail.

- Serveur : mettre la clé dans la variable d'environnement `METEOFRANCE_API_KEY` (jamais dans l'app mobile).
- Environnement cloud du projet : la clé est enregistrée comme secret réseau pour `public-api.meteofrance.fr`
  et ajoutée automatiquement par le relais ; aucune variable à définir.

```bash
pip install -r requirements.txt
python3 build_weather.py --hours 40 --out ../../apps/mobile/src/data/zones/meteo-toulouse.json
```

Environ 45 requêtes par exécution (quota : 100 par minute) ; à relancer après chaque nouvelle exécution
d'AROME (toutes les 3 h).
