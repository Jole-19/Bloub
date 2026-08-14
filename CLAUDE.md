# grok-bot — notes pour Claude

## Stack et commandes

Vue 3.5 + Vite 8 + TS strict + Tailwind 4 (plugin `@tailwindcss/vite`, pas de
`tailwind.config.js`), pnpm. Port dev **5190** (déclaré dans `.claude/launch.json`).

```bash
pnpm dev       # 5190
pnpm test      # vitest, 25 tests
pnpm build     # vue-tsc --noEmit && vite build
```

Style : 2 espaces, simple quote, **pas de point-virgule**, commentaires en
français. Pas d'ESLint ni de Prettier dans le projet — `vue-tsc` est le seul
garde-fou, le lancer avant de conclure.

## La règle la plus importante

**Les constantes numériques du bot sont des mesures relevées sur la vidéo de
référence, pas des réglages.** Angles de regard, tailles d'yeux, rayons,
timings, couleurs : tout vient d'une analyse image par image. Ne pas les
« arrondir », les « simplifier » ni les remplacer par des valeurs qui semblent
plus propres — ça casse la ressemblance, qui est le seul critère de réussite ici.

Les pièges vérifiés, à ne pas « corriger » :

- Les yeux penchent comme `\\`, pas `//`.
- Le corps est un **cercle parfait**, pas un squircle.
- Les transitions sont des **ease-out exponentiels** ; le corps n'a **jamais**
  d'overshoot. Les seuls effets de ressort sont locaux et écrits dans l'état
  concerné (pop de la pastille +14 %, ouverture des yeux +7 %). Il n'y a
  volontairement **pas** de moteur de ressort dans le projet.
- Le `!` vertical a une barre **tronconique** (haut/bas = 1,76) ; le `!` penché
  a une barre **capsule**. Ce ne sont pas la même forme.
- Dans l'état comète, le point **ne se déplace pas** : la traînée l'orbite.
- Au repos l'avatar est **immobile** : pas de flottement à ajouter.

## Décisions d'architecture

- **`src/bot/` est sans framework et sans horloge.** `engine.sample(t)` est une
  fonction pure du temps. C'est ce qui rend possible la prop `frozenAt`, la
  planche d'états et les tests sans DOM. Ne pas y introduire d'état interne
  dépendant du temps réel, de `Date.now()` ni d'import Vue.
- **Toutes les silhouettes partagent le même échantillonnage angulaire**
  (`PROFILE_SAMPLES`), ce qui rend le morphing trivial (interpolation des
  rayons). Toute nouvelle forme doit passer par un profil radial, ou par
  `profileFromPolygon` si elle n'est pas exprimable en `r(theta)`.
- **Les yeux sont des trous dans un `<mask>`**, pas des formes blanches posées
  par-dessus : c'est ce qui les fait rogner tout seuls au bord de la silhouette.
- **Les états déclarent des `ArcSpec`** (géométrie en unités de rayon de boule) ;
  seul le moteur connaît l'échelle du viewBox et rasterise. Ne pas appeler
  `arcRender` depuis `states.ts`.

## Fichier généré

`src/bot/profiles.ts` est produit par `tools/extract-profiles.py` à partir des
images de la vidéo (voir README). Ne pas l'éditer à la main ; le régénérer.

## URLs utiles

- `#planche` — les 14 états côte à côte, figés (vérification visuelle rapide).
- `#etat=<id>&stop` — ouvre un état précis, séquence à l'arrêt.
