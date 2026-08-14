# grok-bot — notes pour Claude

## Stack et commandes

Vue 3.5 + Vite 8 + TS strict + Tailwind 4 (plugin `@tailwindcss/vite`, pas de
`tailwind.config.js`), pnpm. Port dev **5190** (déclaré dans `.claude/launch.json`).

```bash
pnpm dev       # 5190
pnpm test      # vitest
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

Une seule exception, et elle est volontaire : **`--ink` (styles.css) est la
couleur de l'interface, choisie, pas relevée** — un bleu nuit. Le noir de la
vidéo, lui, n'a pas bougé : c'est celui du bot, dans `skins.ts` (`encre`,
`#0a0a0c`). Retoucher l'un ne touche pas l'autre.

## Décisions d'architecture

- **`src/bot/` est sans framework et sans horloge.** `engine.sample(t)` est une
  fonction pure du temps. C'est ce qui rend possible la prop `frozenAt`, la
  planche d'états et les tests sans DOM. Ne pas y introduire d'état interne
  dépendant du temps réel, de `Date.now()` ni d'import Vue. **`sample()` ne doit
  rien muter non plus** : purger un état « périmé » pendant la lecture (ce qui
  paraît une optimisation innocente) rend le moteur non rejouable — piège déjà
  tombé une fois sur le morph de forme, il y a un test dédié.
- **Le montage (`cycles.ts`) tient ou coupe, il ne met jamais le temps à
  l'échelle.** Étirer un bloc laisse l'état tourner plus longtemps (ceux qui
  bouclent font des tours de plus, les autres tiennent leur pose finale) ;
  le raccourcir le coupe. Multiplier le temps local par une vitesse serait
  tentant et casserait d'un coup **toutes** les durées relevées. D'où deux
  planchers : `MIN_BLOCK` (0,6 s — le moteur n'a qu'une case d'historique, un
  bloc plus court que le morph d'entrée du suivant saute à l'image) et
  `StateDef.minDuration`, la date où l'animation aboutit, lue dans les
  constantes de son `pose()` — à renseigner pour tout nouvel état narratif.
- **Toutes les silhouettes partagent le même échantillonnage angulaire**
  (`PROFILE_SAMPLES`), ce qui rend le morphing trivial (interpolation des
  rayons). Toute nouvelle forme doit passer par un profil radial, ou par
  `profileFromPolygon` si elle n'est pas exprimable en `r(theta)`.
- **Les yeux sont des trous dans un `<mask>`**, pas des formes blanches posées
  par-dessus : c'est ce qui les fait rogner tout seuls au bord de la silhouette.
- **Deux sources de formes, à ne pas mélanger.** `profiles.ts` est généré depuis
  la vidéo et sert aux états animés ; `skins.ts` contient les formes du
  personnalisateur, construites analytiquement. Une forme choisie par
  l'utilisateur ne remplace le corps que sur les états `baseBody: true` (repos,
  clin d'œil, yeux écarquillés, notification) : ailleurs, la silhouette EST
  l'animation.
- **Tout ce qui est posé « sur » le corps doit suivre son rayon réel.** Les yeux
  vivent sur une sphère de rayon 1 ; sur une forme non circulaire ils sortent de
  la silhouette et le masque les coupe. D'où `radiusAtAngle` dans `engine.ts`,
  appliqué aux yeux et à la pastille de notification. Si tu ajoutes un élément
  ancré au contour, il lui faut le même traitement.
- **Les états déclarent des `ArcSpec`** (géométrie en unités de rayon de boule) ;
  seul le moteur connaît l'échelle du viewBox et rasterise. Ne pas appeler
  `arcRender` depuis `states.ts`.

- **L'expression de repos est reglable, la silhouette des etats ne l'est pas.**
  Seul `idle` porte `baseFace: true` : les autres etats a visage (clin d'oeil,
  yeux ecarquilles, notification) ont une expression relevee sur la video, c'est
  precisement ce qu'on reproduit.
- **Une inclinaison ne se voit que sur un oeil allonge.** `EyeCfg.tilt` incline
  chaque oeil independamment (indispensable a la colere et a la tristesse, qui
  demandent des inclinaisons en miroir). Mais un oeil dont le rapport
  largeur/hauteur approche 1 est un cercle : il a la meme allure a tout angle et
  l'inclinaison est invisible. Piege deja tombe une fois — viser un rapport
  d'au moins 1.8, ou 0.55 dans l'autre sens.

## Fichier généré

`src/bot/profiles.ts` est produit par `tools/extract-profiles.py` à partir des
images de la vidéo (voir README). Ne pas l'éditer à la main ; le régénérer.

## URLs utiles

- `#planche` — les 14 états côte à côte, figés (vérification visuelle rapide).
  C'est le seul chemin sûr : il ne dépend d'aucun montage.
- `#etat=<id>&stop` — ouvre un état précis, lecture à l'arrêt. Il cherche l'état
  dans les montages de l'utilisateur, qui sont tous éditables : si celui-ci l'a
  retiré partout, le lien ne s'applique pas.
