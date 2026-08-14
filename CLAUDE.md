# bloub — notes pour Claude

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
- **`Look` (engine.ts) vise en ABSOLU, et c'est le moteur qui mélange.** `yaw` et
  `pitch` remplacent ceux de la pose à mesure que `mix` monte, et ce mélange doit
  être fait par le moteur parce que seul lui connaît la pose *à l'instant t* : un
  appelant qui compenserait l'orientation de l'expression lirait sa valeur
  d'**arrivée** pendant que le morph est encore en cours, et les yeux sautaient à
  chaque changement d'humeur. Il faut aussi que ce soit absolu sur les **deux**
  axes : en relatif, la hauteur des yeux suivait celle de chaque expression — et
  « neutre » regarde 30° plus haut que les autres — donc ils tombaient d'un coup à
  la première humeur. Ce qui distingue une humeur pendant le suivi, c'est la
  **forme** de ses yeux, pas l'endroit où elle regarde. `spin`, enfin, est un tour
  parcouru en chemin : gratuit sur une sphère, et sans effet sur le point
  d'arrivée puisque `-360°` est le même angle que `0`.
- **Les humeurs de la vue Réglages ont toutes un roulis nul** (`HUMEURS`,
  `src/ui/gaze.ts`). Ce n'est pas une liste de goûts : le roulis, lui, n'est pas
  neutralisé par le suivi, et il fait pencher la tête donc bouger les yeux
  verticalement. Y ajouter « curieux » (roulis −15°) ramène le saut.
- **`mix` et `wander` ne se confondent pas.** `mix` dit à quel point l'extérieur
  commande la direction ; `wander` ce qui reste de dérive automatique. Quand le
  pointeur bouge, la dérive doit s'éteindre — cumulées, le bot chercherait le
  curseur sans jamais le tenir. Mais **sans** pointeur (arrivée au clavier, au
  tactile, souris sortie de la fenêtre) la tête doit rester tournée *et* continuer
  de vivre. Les avoir confondus figeait le regard dès l'ouverture de la vue. La
  dérive s'ajoute donc **après** le mélange, sinon la cible l'annulerait avec la
  pose.
- **`setLook` refuse une cible non finie.** Le moteur garde la dernière : un `NaN`
  posé une seule fois s'y installe pour toujours et le bot ne se repose plus
  jamais. C'est arrivé — un `getBoundingClientRect` sur une boîte de taille nulle
  (volet du navigateur masqué) donne `0 / 0` chez l'appelant. L'appelant est
  corrigé, mais le moteur n'a pas à dépendre de la prudence des siens.

## Arrivée sur le site

L'introduction jouée en arrivant (`src/ui/intro.ts`, pur et testé) : la boule
paraît seule au centre, **ses yeux font un tour complet autour d'elle** — elle a
l'air de tourner sur elle-même — puis elle glisse à sa place pendant que
l'interface apparaît autour d'elle.

- **Le montage ne joue QUE le repos, et c'est la leçon la plus chère de cette
  feature.** Quatre entrées ont été écrites et comparées côte à côte avant d'en
  garder une. Tout état autre qu'`idle` apporte sa **propre pose de regard**, donc
  un saut des yeux au changement. Et le clignement censé le masquer ne suffit
  pas : il dure **0,2 s** quand le fondu d'entrée en dure **0,3** — les yeux se
  rouvrent en cours de route et ça se lit comme une téléportation (15 px entre
  deux images, mesuré). Les deux durées sont relevées sur la vidéo, aucune ne se
  rallonge. Un clin d'œil a été tenté longuement ici, puis écarté pour ça.
- **Toute l'entrée tient donc dans le script de regard**, pas dans un enchaînement
  d'états : c'est le seul mécanisme du projet dont on **choisit la durée**
  (`setLook(look, now, morph)`), donc le seul qui permette un mouvement d'yeux
  lent. Un fondu d'état, lui, dure ce que la vidéo a mesuré.
- **La boule est RONDE le temps du tour, quelle que soit la forme choisie**, et
  elle morphe vers celle de l'utilisateur en rejoignant sa place. Pas par goût :
  les yeux sont recollés au contour réel (`radiusAtAngle`) pour ne pas déborder de
  la silhouette. Sur un cercle ce rayon est constant, donc le tour est lisse ; sur
  une goutte ils suivent le profil et sautillent — **jusqu'à 25 px d'écart
  vertical** avec la trajectoire du cercle, un test le mesure. Ce n'est pas
  corrigeable ailleurs : `radiusAtAngle` fait exactement ce pour quoi il est là.
- **`tourLook` est saccadé au passage du limbe, et ce n'est pas réglable.** 20 px
  entre deux images : près du bord, un petit angle devient un grand déplacement à
  l'écran et l'œil disparaît puis reparaît. Ralentir n'y change rien, c'est la
  trajectoire qui veut ça — c'est assumé, et c'est ce qui fait l'effet.
- **`intro` et `nue` ne sont pas le même moment.** `intro` dit que le montage
  d'arrivée est joué ; `nue` (dérivé de l'index du lecteur) que la boule est
  encore seule en scène. C'est `nue` qui commande la mise en place ET le retour à
  la forme choisie.
- **Rien ne part au `localStorage`, et c'est volontaire.** Ce qui distingue
  « venir sur le site » de « recharger », c'est le navigateur qui le sait :
  `performance.getEntriesByType('navigation')[0].type`. Une marque persistante
  éteindrait l'arrivée pour toujours après une seule visite — testé, rejeté, il
  fallait passer en navigation privée pour la revoir.
- **Un script de regard doit être amorcé « daté d'un rattrapage plus tôt ».**
  `engine.setLook(script(0), clock - SCRIPT_MORPH, SCRIPT_MORPH)` : sans ça la
  première image sort au regard neutre et la seconde sur le script — **127 px**
  d'un coup pour un script qui commence loin de la pose. Le moteur retourne
  `lookPrev` tant que le rattrapage n'est pas consommé.
- **Un script finit à `mix: 0`**, où la pose commande seule : il n'y a alors
  jamais rien à relâcher, et un relâchement se verrait comme un dernier glissement
  des yeux juste quand tout devrait être posé.
- **Ce qu'un script ne peut PAS anticiper : le roulis.** `Look` ne le pilote
  volontairement pas (la tête penchée est la signature du bot). Chaque état a le
  sien — le clin d'œil penche à +6,7° quand le repos penche à −13 — donc ces
  degrés-là sauteraient au changement d'état quoi qu'on fasse. C'est l'argument
  final en faveur d'une arrivée sans changement d'état.
- Pas d'arrivée sur `#planche`, sur un lien `#etat=` (il vise le lecteur et
  décrit déjà sa lecture) ni sous `prefers-reduced-motion`. `#arrivee` la rejoue,
  et **recharge la page** pour ça : la rejouer à chaud demanderait de remonter
  tout le décor.

## Interface

- **Les icônes de l'interface viennent d'une bibliothèque, pas du crayon.** Les
  tracés de `SideRail.vue` et `Timeline.vue` sont recopiés tels quels depuis des
  paquets Iconify (Solar, et Remix pour la palette). Aucune dépendance n'est
  installée, donc `package.json` ne le signale pas — et la règle « tout est
  relevé » ci-dessus ne s'applique PAS ici. Pour en ajouter ou en changer,
  reprendre le corps du `<symbol>` dans `@iconify-json/<paquet>` : ne pas
  redessiner à la main (essayé, rejeté) ni « recentrer » leurs coordonnées.
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
  **Démonter un panneau ne retire pas sa piste** : la grille lui garde ses 20rem
  et l'avatar reste centré 180 px trop à gauche. D'où `.scene--seule`, qui annule
  les deux colonnes — l'arrivée et l'aperçu s'en servent tous les deux, ne pas la
  restreindre à l'un des deux.
- **La `transition` de l'avatar est hors de la requête de largeur, ses positions
  sont dedans.** Les rapatrier ensemble semble plus propre et casse deux choses :
  l'apparition de l'arrivée vaut à toutes les tailles, et surtout une `transition`
  redéclarée dans le bloc en dessous **chasse l'opacité** — une propriété absente
  de la liste ne transitionne plus du tout, donc la boule apparaîtrait d'un coup.
- **Le rognage horizontal est sur `#app`, pas sur `body`.** L'`overflow` du corps
  est **propagé à la fenêtre** quand la racine est en `visible` : l'y poser ne
  rogne donc rien. Et `clip` plutôt que `hidden`, sur le seul axe x — `hidden` en
  ferait un conteneur de défilement, ce qui forcerait `overflow-y` à suivre et
  couperait le bas du personnalisateur sur une fenêtre basse.
- **Sur grand écran, la page ne défile pas : ce sont les panneaux.** `#app` rogne
  les deux axes au-delà de 64rem, et les panneaux prennent `overflow-y: auto`.
  Piège qui coûte une itération : une piste de grille **automatique** prend la
  hauteur de son contenu et ignore le plafond du conteneur, donc le panneau se
  faisait rogner sans rien avoir à faire défiler. D'où
  `grid-template-rows: minmax(0, 1fr)` sur la scène — c'est lui qui rend la
  hauteur définie et arme l'`overflow-y`.
- **La place de la barre de montage n'est réservée que dans la vue Animations.**
  Réservée dans toutes les vues (un `padding-bottom` sur la scène), elle prenait
  236 px au panneau de droite au profit d'un vide que rien ne remplissait : le
  personnalisateur défilait sous un tiers d'écran blanc. Ce que cette réserve
  tenait *aussi* — l'avatar et le panneau des réglages, qui ne doivent pas se
  recentrer d'un onglet à l'autre — est porté par ces deux colonnes elles-mêmes,
  sous la forme de la même hauteur de bande
  (`100dvh - 3rem - var(--timeline)`) : c'est pour ça que le panneau des réglages
  est en `self-start` + centrage interne et non en `self-center`, un centrage sur
  la colonne le ferait descendre de cent pixels dès qu'elle va jusqu'en bas.
- **Le grand mot du pied de page est `absolute`, pas `fixed`.** `#app` fait
  exactement la hauteur de la fenêtre, donc le bas est le même — mais un élément
  fixe est *sorti* du document et ne suit pas le rebond élastique quand on tente
  de faire défiler une page qui ne défile pas. En `absolute`, il accompagne le
  geste, comme celui de la landing page de Yuzu dont il est repris. Sa taille se
  calcule sur la place réellement disponible
  (`calc((100vw - 7rem) / 3.05)`, 3,05 étant la largeur mesurée du mot en
  cadratins) : en `vw` seul, son dernier caractère finissait hors de l'écran.
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
  va (`bloub:langue`). Sans cette distinction, un premier passage depuis
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
- `#arrivee` — rejoue l'introduction. Elle ne se joue qu'à la **venue** sur le
  site, donc sans ce lien on ne peut pas la revoir de la séance.
- `#etat=<id>&stop` — ouvre un état précis, lecture à l'arrêt. Il cherche l'état
  dans les montages de l'utilisateur, qui sont tous éditables : si celui-ci l'a
  retiré partout, le lien ne s'applique pas.
