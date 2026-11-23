# VTC Profit AI

Copilote de décision pour chauffeurs VTC : aider à choisir **où et quand travailler** pour maximiser le
**revenu après commission et coûts variables, par heure réellement mobilisée** — toutes plateformes confondues.

> Phase actuelle : **maquette** (données fictives) — à valider avant le développement des fonctionnalités.

## Structure

```
apps/mobile/        Application React Native (Expo, Expo Router) — Android, iOS, web
services/forecast/  (à venir) Service Python de prévision / recommandation
supabase/           (à venir) Schéma PostgreSQL + PostGIS, RLS, migrations
docs/               Notes de conception, décisions
```

## Démarrer l'application

```bash
cd apps/mobile
npm install
npm run web        # aperçu navigateur
npm start          # Expo Go / simulateur
```

Vérifications :

```bash
cd apps/mobile
npm run typecheck
```

## Principes non négociables (extraits du cahier des charges)

- L'app reste utile **sans API partenaire** : import CSV → GPS consenti → OAuth officiel si autorisé.
- **Aucune règle Uber codée en dur** : plateformes, catégories, avantages et seuils sont des paramètres par pays/ville.
- **Provenance tracée** pour chaque donnée ; une estimation n'est jamais présentée comme une donnée plateforme.
- Une plage de connexion multi-plateforme n'est **comptée qu'une fois**.
- RGPD : consentements séparés, minimisation, export/suppression ; domicile affiché en zone agrégée.
- **Aucune garantie de gains** ; aucune sollicitation dangereuse pendant la conduite.
- Pas de scraping, de falsification GPS, d'interception de notifications ni d'automatisation d'actions Uber.

Voir [`docs/maquette.md`](docs/maquette.md) pour le périmètre de la maquette.
