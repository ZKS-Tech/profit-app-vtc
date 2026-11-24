# Mise à jour automatique des données (serveur)

```
GitHub Actions (calendrier)  →  services/pipeline.py  →  Supabase Storage (bucket public « donnees »)  →  app
```

| Tâche | Fréquence (heure de Paris, hiver) | Sources |
|---|---|---|
| `tisseo` | toutes les 30 min, ~5h–23h | Tisséo GTFS-RT + GTFS (ODbL) |
| `meteo` | toutes les 3 h | Météo-France observation + AROME (Licence Ouverte) |
| `transport` | chaque nuit (~4h20), 7 jours à l'avance | SNCF, FlixBus, BlaBlaCar Bus (ODbL) |

Fichier : `.github/workflows/donnees-carte.yml`. Lancement manuel : onglet **Actions** du dépôt →
« Mise à jour des données de la carte » → **Run workflow**.

## Configuration (une seule fois)

1. **Supabase** : Storage → New bucket `donnees`, **Public bucket** activé.
2. **Secrets GitHub** (Settings → Secrets and variables → Actions) :
   - `SUPABASE_URL` : `https://<projet>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` : clé secrète (`sb_secret_…`) ou ancienne clé `service_role`
   - `METEOFRANCE_API_KEY` : clé « API Key » du portail Météo-France
3. **App** : `apps/mobile/.env` (voir `.env.example`) :
   `EXPO_PUBLIC_DATA_URL=…` (facultatif : l'adresse du projet « vtc profit » est déjà dans `src/data/live.tsx`)
   Cette adresse n'est pas secrète. Aucune clé n'est intégrée à l'app.

Sans secrets Supabase, les données produites restent disponibles 3 jours comme artefact de l'exécution.

## Comportement de l'app

- Au démarrage puis toutes les 10 min : lecture de `manifest.json`, puis des fichiers listés.
- En cas d'échec réseau : repli sur les données intégrées à l'app, signalé sous le titre de la carte.
- La carte s'ouvre sur le jour et la demi-heure en cours.
- L'aperçu web publié sur claude.ai ne peut pas lire Supabase (restriction du site) : il reste sur les
  données intégrées. Les données à jour s'affichent dans l'app installée ou en local (`npm run web`).

## En local

```bash
pip install -r services/requirements.txt
python3 services/pipeline.py --jobs transport,tisseo,meteo --out build/data
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 services/publish_supabase.py build/data
```

## Quota GitHub Actions

Sur un dépôt privé, l'offre gratuite inclut un nombre limité de minutes par mois. Le calendrier ci-dessus
est réglé pour rester raisonnable (Tisséo toutes les 30 min et non toutes les 5 min). Consommation à
vérifier après quelques jours dans Settings → Billing.
