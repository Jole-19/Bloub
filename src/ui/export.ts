/**
 * Cadrage et nommage des images exportees. Tout est pur : aucun DOM, donc
 * testable en environnement `node` comme le reste de `src/ui/`. La rasterisation
 * vit dans `capture.ts`, elle, parce qu'elle a besoin d'un canvas.
 */

import { SHAPES } from '@/bot/skins'

/**
 * Rayon de la boule au repos, en unites de viewBox : c'est le `scale` que
 * BloubBot.vue passe a `BotEngine` (son `R`). Redit ici et non importe parce
 * qu'un `<script setup>` ne peut rien exporter. Ce qui compte est verrouille
 * par un test : le cadre doit contenir TOUTES les formes.
 */
const RAYON_BOULE = 100

/**
 * Marge autour de la forme la plus large. Huit pour cent : c'est ce qui permet
 * au rognage circulaire d'une photo de profil (Discord, Slack, GitHub) de ne
 * pas mordre dans la silhouette.
 */
const MARGE = 1.08

/**
 * Rayon de la forme la plus etalee, en unites de rayon de boule. Calcule et non
 * ecrit en dur : ajouter une forme plus large deplace le cadre tout seul au lieu
 * de se faire rogner.
 */
export const RAYON_MAX = Math.max(...SHAPES.map((forme) => Math.max(...forme.radii)))

/**
 * Demi-cote du cadre d'export, en unites de viewBox.
 *
 * Il est plus SERRE que le viewBox de l'ecran (158), et c'est volontaire : la
 * marge de l'ecran loge les anneaux des etats animes, qui n'existent pas au
 * repos. La garder ferait un export rempli a 63 % de vide, et une boule
 * minuscule dans un rognage de photo de profil.
 *
 * Un seul cadre pour les huit formes, et pas un recadrage forme par forme : les
 * rayons de `skins.ts` sont normalises pour que « toutes les formes pesent
 * pareil a l'oeil », or les recadrer separement remettrait chacune a la meme
 * taille et casserait ce reglage.
 */
export const DEMI_CADRE = Math.ceil(RAYON_BOULE * RAYON_MAX * MARGE)

/** viewBox du document exporte, centre sur la boule. */
export function viewBoxExport(demi = DEMI_CADRE) {
  return `${-demi} ${-demi} ${demi * 2} ${demi * 2}`
}

export type ActionId = 'png' | 'svg' | 'webp' | 'copie' | 'copieSvg'

/** Ce qu'on fait de l'image une fois produite. */
export type ModeExport = 'telecharge' | 'anime' | 'copieImage' | 'copieTexte'

export interface ActionExport {
  id: ActionId
  mode: ModeExport
  /** Cote de l'image en pixels. */
  taille: number
  extension: 'png' | 'svg' | 'webp'
}

/**
 * Cadence de l'animation exportee. Le clignement dure 0,18 s (mesure, `BLINK_DUR`
 * dans face.ts) : en dessous de 20 images par seconde il ne reste plus assez
 * d'images pour qu'il se lise comme un clignement plutot que comme un saut.
 */
export const ANIM_FPS = 20

/**
 * Duree capturee. Le premier clignement tombe a 1,4 s puis les suivants toutes
 * les 1,9 a 4,6 s (`BLINKS`, face.ts) : quatre secondes en contiennent donc
 * toujours au moins un. Plus court, on exporterait souvent une boule qui se
 * contente de deriver.
 *
 * Il n'y a PAS de boucle sans couture a viser : les periodes de la derive sont
 * volontairement premieres entre elles pour que le mouvement ne se repete jamais
 * a l'oeil (`liveliness`, face.ts). Le raccord se verra, c'est le prix de cette
 * decision-la — et il se voit d'autant moins que le regard derive lentement.
 */
export const ANIM_SECONDES = 3

export const ANIM_IMAGES = ANIM_FPS * ANIM_SECONDES
export const ANIM_PAS = 1 / ANIM_FPS

/**
 * Cote de l'animation, bien plus petit que celui du PNG : le conteneur WebP anime
 * ne compresse RIEN entre les images (chacune est autonome), donc le poids est
 * strictement proportionnel au nombre d'images. Mesure a 384 px : 3,5 ko par
 * image, soit 290 ko pour quatre secondes — au-dela de ce qu'acceptent les
 * emojis animes de Discord (256 ko) ou de Slack (128 ko). A 320 px sur trois
 * secondes on reste dans une taille qui se partage.
 */
export const ANIM_TAILLE = 320

/**
 * UNE seule taille de PNG, volontairement : proposer 1024 et 2048 obligeait
 * l'utilisateur a trancher une question qui n'est pas la sienne. 1024 couvre
 * toutes les specs de photo de profil (Discord 128, X 400, GitHub 500, Slack
 * 512) en se reduisant proprement, et un aplat vectoriel a cette taille ne pese
 * que quelques ko. Qui veut plus grand prend le SVG, qui n'a pas de taille.
 *
 * Pas de GIF : 256 couleurs et une transparence sur 1 bit, donc un bord en
 * escalier la ou le PNG a 8 bits d'alpha. Sur une boule, ca se voit.
 *
 * Le catalogue ne porte que des **ids** : les libelles sont resolus par
 * `t('export.<id>')`, et l'union litterale au-dessus fait verifier a la
 * compilation que chacun a sa traduction dans les trois langues.
 */
export const ACTIONS: ActionExport[] = [
  { id: 'png', mode: 'telecharge', taille: 1024, extension: 'png' },
  { id: 'svg', mode: 'telecharge', taille: DEMI_CADRE * 2, extension: 'svg' },
  { id: 'webp', mode: 'anime', taille: ANIM_TAILLE, extension: 'webp' },
  { id: 'copie', mode: 'copieImage', taille: 1024, extension: 'png' },
  { id: 'copieSvg', mode: 'copieTexte', taille: DEMI_CADRE * 2, extension: 'svg' }
]

export const ACTION_BY_ID = new Map<string, ActionExport>(ACTIONS.map((a) => [a.id, a]))

/** Ce que fait le bouton principal ; les autres sont dans le menu. */
export const ACTION_DEFAUT: ActionId = 'png'

/**
 * Etat de la barre d'export. Un telechargement ne se voit pas forcement — selon
 * le navigateur il tombe dans un dossier sans rien afficher — d'ou cette
 * confirmation : sans elle, l'utilisateur reclique en croyant que rien n'a pris.
 */
export type EtatExport = 'pret' | 'occupe' | 'exporte' | 'copie' | 'erreur'

/**
 * Retire les commentaires XML. Le SVG du bot en porte de longs, qui expliquent
 * le masque a qui lit le composant — ils n'ont rien a faire dans un fichier
 * livre a l'utilisateur.
 */
export function sansCommentaires(markup: string) {
  return markup.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * `bloub-goutte-neutre-encre.png`.
 *
 * Construit sur les **ids** et non sur les libelles traduits : le nom du fichier
 * ne doit pas changer avec la langue de l'interface.
 *
 * Les ids sont filtres alors qu'ils viennent d'unions litterales, parce que
 * `App.vue` les relit du `localStorage` sans les valider : une valeur trafiquee
 * n'a pas a pouvoir composer le nom du fichier telecharge.
 */
export function nomFichier(
  forme: string,
  expression: string,
  couleur: string,
  extension: string
) {
  const propre = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  const morceaux = [propre(forme), propre(expression), propre(couleur)].filter(Boolean)
  return `bloub${morceaux.map((m) => `-${m}`).join('')}.${extension}`
}
