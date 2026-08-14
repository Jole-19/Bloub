# grok-bot

Recréation en SVG animé de l'avatar du bot Grok (x.ai/bot) : **une seule forme
noire pleine** qui morphe entre 14 états, **deux formes blanches** pour les yeux
qui morphent indépendamment, sur fond blanc. Aucune librairie d'animation.

```bash
pnpm install
pnpm dev          # http://localhost:5190
pnpm test         # 25 tests
pnpm build        # vue-tsc + vite build
```

- `#planche` affiche les 14 états côte à côte, figés à une date choisie.
- `#etat=orbit&stop` ouvre directement un état, séquence à l'arrêt.

## Ce qui n'est pas deviné

Tout est **relevé au pixel sur la vidéo de référence**, pas dessiné à vue. La
vidéo a été découpée à 10 images/s, puis chaque état mesuré : silhouettes par
lancer de rayon sous-pixel, yeux par ajustement de capsule (ACP), couleurs et
épaisseurs par échantillonnage direct.

Les constantes du code sont donc des **mesures**, pas des réglages esthétiques.
Quelques-unes, contre-intuitives, valent d'être connues avant de « corriger »
quoi que ce soit :

| Croyance courante | Ce que dit la vidéo |
|---|---|
| Les yeux penchent comme `//` | Ils penchent comme `\\` (haut vers la gauche, 25,3° de la verticale) |
| Le corps est un squircle | C'est un **cercle parfait** (déviation radiale < 0,7 %) |
| Les transitions sont des ressorts | Ce sont des **ease-out exponentiels**, sans dépassement du corps |
| La barre du `!` est une capsule | Le `!` **vertical** est tronconique (haut/bas = 1,76) ; seul le `!` **penché** est une capsule |
| La comète traverse l'écran | Le point **reste au centre**, c'est la traînée qui l'orbite |
| Le point du `!` penché est un disque | C'est une **goutte**, bout rond côté barre, pointe à l'opposé |
| L'avatar flotte au repos | Il est **immobile** (centre stable à ±0,003) : toute la vie passe par le regard et les clignements |

Deux mécaniques structurent le reste :

**Les yeux vivent sur une sphère.** L'œil proche du bord fait 0,69 fois la
largeur de l'autre et 0,663 fois son aire — exactement le facteur de profondeur
d'un point de sphère à cette distance du centre. Chaque œil récupère donc le
repère tangent de la sphère, projeté en orthographique : la compression, le
basculement et le passage derrière le limbe en découlent tout seuls. Les poses
de regard (`REST_GAZE` et les `gaze` par état) sont issues d'un ajustement du
modèle sur les positions mesurées, avec une erreur résiduelle de ~1 px sur une
boule de 190 px.

**Chaque changement de forme est masqué par un clignement.** C'est le mécanisme
d'atténuation du morph dans l'original, reproduit par `blinkIn` sur les états
concernés.

## Architecture

Le cœur (`src/bot/`) est **sans framework et sans horloge** : `engine.sample(t)`
est une fonction pure du temps. Pause, reprise, saut à une date arbitraire et
tests donnent la même image au pixel près — c'est ce qui permet la planche
d'états figés et les tests sans DOM.

| Fichier | Rôle |
|---|---|
| `profiles.ts` | Profils radiaux `r(theta)` relevés sur la vidéo. **Généré**, ne pas éditer. |
| `shape.ts` | Silhouette = profil radial + pose. Morphing, échantillonnage, path Catmull-Rom. |
| `face.ts` | Modèle de sphère des yeux, dérive du regard, clignements. |
| `decor.ts` | Anneaux et rubans (arcs elliptiques 3D), particules, pastille de notification. |
| `states.ts` | Les 14 états : silhouette, regard, décor, timings. |
| `engine.ts` | Machine à états, transitions, assemblage d'une image. |

Le morphing tient à un choix : **toutes les silhouettes sont échantillonnées aux
mêmes angles**. Deux formes quelconques ont donc des points qui se correspondent
un à un, et une transition se réduit à une interpolation linéaire des rayons —
d'où l'absence de librairie de morphing de path.

Les yeux sont de **vrais trous** percés dans le corps (`<mask>`), comme sur
x.ai : ils restent donc rognés par la silhouette quand ils glissent vers le
bord, sans code de découpe. L'encoche de la pastille de notification utilise le
même masque.

Les anneaux sont des cercles 3D projetés en orthographique ; la composante `z`
coupe chaque arc en deux, la moitié arrière étant dessinée **avant** le corps
donc occultée par lui. C'est ce tri en profondeur qui les fait lire comme des
orbites plutôt que comme un dessin plat.

## Régénérer les profils

`src/bot/profiles.ts` est produit à partir des images de la vidéo :

```bash
ffmpeg -i reference.mp4 -vf fps=10 frames/h_%04d.png
pip install numpy pillow
python tools/extract-profiles.py frames/ > src/bot/profiles.ts
```

## Intégrer le composant

```vue
<GrokBot v-model:state="etat" v-model:playing="lecture" :size="440" />
<GrokBot state="orbit" :size="120" :frozen-at="1.2" />   <!-- image figée -->
```
