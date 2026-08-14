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
  Le code Vue partagé entre composants (composables, réglages d'affichage) va
  dans **`src/ui/`** — c'est là qu'il faut le mettre plutôt que de céder à la
  tentation d'un import Vue dans `src/bot/`.
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

- **Les libellés ne vivent pas dans `src/bot/`.** Les catalogues (`states.ts`,
  `skins.ts`, `expressions.ts`) ne portent que des **ids**, et l'affichage résout
  `t('states.orbit')`. Corollaire : leurs ids sont des **unions littérales**
  (`ShapeId`, `ColorId`, `ExpressionId`, `StateId`) — pas par coquetterie, mais
  parce que c'est ce qui fait vérifier **à la compilation** que chaque entrée a sa
  traduction dans les trois langues. Ajouter une forme sans son libellé ne compile
  pas.
- **Un seul état n'est pas relevé sur la vidéo : `swirl`.** C'est la transition
  d'entrée des réglages, choisie comme `--ink`. Elle est volontairement **hors de
  `SEQUENCE`** (donc absente de la palette et de la planche, et un test le
  verrouille), et porte `baseBody` **et** `baseFace` : c'est ce qui lui permet de
  morpher depuis la forme choisie vers la boule, et de laisser le suivi du regard
  s'appliquer dès sa première image.
- **`Look` (engine.ts) n'a pas la même sémantique sur ses deux axes, et c'est
  voulu.** `yaw` est une direction **absolue** que le moteur mélange à la pose
  (`mix`) ; `pitchOffset` est un **écart** ajouté. Le lacet doit être absolu parce
  que seul le moteur connaît la pose *à l'instant t* : un appelant qui
  compenserait le lacet de l'expression lirait sa valeur d'**arrivée** pendant que
  le morph est encore en cours, et les yeux sautaient à chaque changement
  d'humeur. Piège déjà tombé une fois. `spin` est un tour parcouru en chemin —
  gratuit sur une sphère, et sans effet sur le point d'arrivée puisque `-360°` est
  le même angle que `0`.

## Interface

- **Tronquer, c'est `tronque`, pas `truncate`.** L'utilitaire maison (styles.css)
  coupe au mot et colle les points au texte ; `truncate` coupe au milieu d'un mot
  et laisse une espace avant les points quand la coupe tombe entre deux mots.
- **Le reset Tailwind casse les éléments de la couche supérieure.** Il met
  `margin: 0` partout, or c'est la marge auto qui centre un `<dialog>` en modal :
  sans `m-auto`, la boîte se colle en haut à gauche. Même famille de piège pour
  un `popover`, dont les styles par défaut posent `inset: 0` : tout calage doit
  remettre à `auto` les côtés qu'il n'utilise pas, sinon c'est `top: 0` qui gagne.
- **La scène est une grille de trois colonnes, et c'est ce qui déplace l'avatar.**
  `[panneau gauche] [avatar] [panneau droit]` : une seule colonne de panneau a une
  largeur à la fois, et c'est l'**interpolation des pistes** qui fait glisser
  l'avatar. Écrit dans `styles.css` et pas en utilitaires parce que les deux états
  doivent être des valeurs littérales pour que la transition ait de quoi
  interpoler. Ne pas tenter `order` ni `flex-direction` : ils ne s'animent pas.
- **Le rognage horizontal est sur `#app`, pas sur `body`.** L'`overflow` du corps
  est **propagé à la fenêtre** quand la racine est en `visible` : l'y poser ne
  rogne donc rien. Et `clip` plutôt que `hidden`, sur le seul axe x — `hidden` en
  ferait un conteneur de défilement, ce qui forcerait `overflow-y` à suivre et
  couperait le bas du personnalisateur sur une fenêtre basse.
- **L'URL décrit le lecteur, pas les vues.** `#etat=` n'est écrit que depuis la
  vue Animations. L'écrire ailleurs déclenchait un `hashchange` qui replaçait la
  tête de lecture sur les index du montage de l'utilisateur, alors que les
  réglages jouent le leur : le lecteur restait coincé sur son état d'entrée.

## Langues

- **La couche i18n est maison (`src/i18n/`), et c'est mesuré, pas dogmatique.**
  Sur cette chaîne d'outils, `vue-i18n` pèse **+34,4 ko gzip** contre **+0,55 ko**
  pour ces ~50 lignes, pour 3 langues et ~90 chaînes sans date ni monnaie à
  formater — et il ne détecte pas les clés inconnues à la compilation, là où
  `t()` typé le fait. Le jour où il faut du chargement paresseux, plus de dix
  langues, ou des traducteurs non-devs, la bascule se fait sans toucher aux
  appelants.
- **`locales/fr.ts` est la référence, `en.ts` et `zh.ts` sont typées
  `typeof fr`** : une clé oubliée est une erreur de compilation nommée. **Surtout
  pas de `as const` sur `fr.ts`** — chaque valeur deviendrait son propre type
  littéral et *toutes* les traductions seraient refusées.
- **La détection ne s'écrit pas dans le stockage.** Seul un choix **explicite** y
  va (`grokbot:langue`). Sans cette distinction, un premier passage depuis
  l'étranger figerait cette langue pour toujours.
- **Les guillemets, espaces et ponctuations appartiennent à la traduction**, pas
  au code : le français veut « … » avec insécables, l'anglais "…", le chinois de
  la ponctuation pleine largeur et pas d'espace avant ses unités. Un composant qui
  ajoute un `« ` casse deux langues sur trois. Même règle pour les nombres :
  `Intl` s'en charge (`nombre`, `pourcentage`, `secondes`), jamais un
  `.replace('.', ',')`.
- **`src/ui/timeline.ts` est pur : pas de mise en forme localisée dedans.** Les
  durées passent par `secondes` / `secondesCourtes` de `@/i18n`, qui a la langue
  courante. Seul `mmss` y reste — il n'a ni unité ni séparateur décimal.
- **Un montage sans nom est le montage d'amorce.** `defaultCycle()` a
  `name: ''`, et l'affichage résout `nomDeCycle()` : c'est ce qui lui fait suivre
  la langue. Y écrire « Cycle par défaut » le figerait, le nom partant au
  `localStorage` dès la première visite.

## Fichier généré

`src/bot/profiles.ts` est produit par `tools/extract-profiles.py` à partir des
images de la vidéo (voir README). Ne pas l'éditer à la main ; le régénérer.

`public/favicon.svg` n'est pas un dessin approchant : le cercle et les **deux
matrices d'yeux** sont ceux que rend `engine.sample(1)` sur `idle`. D'où l'œil de
droite plus étroit que celui de gauche (0,64 contre 0,87) — c'est la compression
de profondeur, pas une faute de frappe. Les `favicon.ico` et
`apple-touch-icon.png` en sont rasterisés (le `.ico` reste nécessaire : Safari ne
lit le SVG qu'à partir de la version 26, iOS pas avant 18.7).

## URLs utiles

- `#planche` — les 14 états côte à côte, figés (vérification visuelle rapide).
  C'est le seul chemin sûr : il ne dépend d'aucun montage.
- `#etat=<id>&stop` — ouvre un état précis, lecture à l'arrêt. Il cherche l'état
  dans les montages de l'utilisateur, qui sont tous éditables : si celui-ci l'a
  retiré partout, le lien ne s'applique pas.
