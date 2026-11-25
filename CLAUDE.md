# VTC Profit AI — consignes pour les agents

Copilote de décision pour chauffeurs VTC (pilote : Toulouse). Indicateur central :
**(revenu après commission − coûts variables imputables) / heures réellement mobilisées**.

## Dépôt
- `apps/mobile` : Expo (SDK 58) + Expo Router, TypeScript. Routes dans `src/app/`, le reste dans `src/`.
  Lire `apps/mobile/AGENTS.md` avant de toucher aux API Expo.
- Données de démonstration **uniquement** dans `apps/mobile/src/demo/` ; ne jamais les mélanger aux données réelles.
- Logique métier pure dans `apps/mobile/src/domain/` (sans dépendance UI).

## Commandes
```bash
cd apps/mobile && npm install
npm run typecheck
npm run web          # aperçu navigateur
npm run build:web    # export web dans dist/
```
Dans un environnement sans accès à api.expo.dev : préfixer `npx expo install` / `expo export` par `EXPO_OFFLINE=1`.

App Android (compte Expo « evanlgz », projet vtc-profit-ai, profil `pilote`) :
```bash
cd apps/mobile
npx eas-cli build -p android --profile pilote --non-interactive --no-wait   # nouvelle version (module natif ajouté)
EXPO_OFFLINE=1 npx eas-cli update --channel pilote --platform android --environment preview \
  --message "…" --non-interactive                                          # mise à jour à distance (JS seulement)
```
Une mise à jour à distance ne vaut que pour la même `version` (runtimeVersion = appVersion) : ne pas changer
`version` dans app.json sans recompiler.

## Règles produit (cahier des charges)
- Ne jamais présenter une estimation comme une donnée Uber ; afficher provenance, confiance et date de mise à jour.
- Aucune règle de plateforme codée en dur : catégories, avantages, commissions, seuils = configuration par pays/ville.
- Une plage de connexion multi-plateforme n'est comptée qu'une fois.
- L'état « en course » vient d'une source autorisée ou d'une confirmation utilisateur, jamais déduit du seul GPS.
- Pas de scraping, falsification GPS, interception de notifications ni automatisation d'actions Uber.
- Jamais d'identifiants Uber saisis dans l'app (OAuth uniquement, après approbation).
- RGPD : consentements séparés, minimisation, export/suppression ; domicile en zone agrégée.
- Aucune garantie de gains ; aucune interaction demandée pendant la conduite.
- Interface en français, unités locales (€, km, 24 h).

## Git
- Commits brefs, en français, auteur `ZKS-Tech <elegouez@gmail.com>`.
