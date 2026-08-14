import type { Look } from '@/bot/engine'

/**
 * Ou le bot regarde quand il suit le curseur. Pur, comme `src/ui/timeline.ts` :
 * la position du pointeur entre en coordonnees deja normalisees, donc la regle
 * se teste sans DOM — et elle a besoin de l'etre, parce que deux signes s'y
 * trompent facilement.
 */

/**
 * Angles en degres d'orientation de tete. CHOISIS, pas releves : la video de
 * reference ne montre aucun suivi de curseur. Assez amples pour se distinguer de
 * la derive au repos (±7deg de lacet, ±5,5 de tangage), assez retenus pour
 * qu'aucun oeil ne parte derriere le limbe de la sphere.
 */
export const YAW_MAX = 16
export const PITCH_MAX = 13

/**
 * Demi-tour de tete de la vue des reglages : le bot cesse de regarder en haut a
 * droite (sa pose de repos) pour regarder a GAUCHE, du cote du panneau.
 *
 * Ce n'est pas un miroir de l'image : les yeux font vraiment le tour de la
 * sphere, donc ils gardent leur inclinaison en `\\` et leur compression de
 * profondeur. Retourner l'image les aurait couches en `//`.
 */
export const TURN = 26

/**
 * Tour complet parcouru EN CHEMIN : les yeux ne glissent pas en travers du
 * visage, ils font le tour de la boule avant d'arriver.
 *
 * C'est gratuit parce que les yeux vivent sur une sphere : passe 90deg de lacet
 * ils franchissent le limbe, le moteur les retire de l'image, puis ils
 * reapparaissent de l'autre cote. Le tourbillon n'est donc pas un effet pose
 * par-dessus, c'est la meme projection orthographique poussee d'un tour.
 *
 * Et surtout : il ATTERRIT JUSTE par construction, `-360deg` etant le meme angle
 * que `0`. C'est ce qui le distingue d'une pose de regard ecrite dans un etat,
 * qui laisse les yeux la ou sa courbe se termine.
 */
export const SPIN = 360

/**
 * Duree du tour. Un peu plus courte que le bloc d'entree (`swirl`) : les yeux
 * doivent etre poses a gauche avant que les anneaux ne s'effacent.
 */
export const TURN_TIME = 1.1

export interface Aim {
  /** ecart horizontal du pointeur au centre du bot, -1 a 1 (droite positive) */
  nx: number
  /** ecart vertical, -1 a 1, dans le sens de l'ecran (bas positif) */
  ny: number
  /** avancement de l'arrivee, 0 a 1 */
  tour: number
}

/**
 * Cible de regard.
 *
 * `tour` mene tout : il fait monter l'emprise sur la pose (`mix`) et fondre le
 * tour parcouru (`spin`) en meme temps. A 0 la pose de l'etat commande seule ; a
 * 1 la tete est posee a gauche et suit le curseur.
 *
 * Rien ici ne compense l'expression affichee : c'est le moteur qui melange,
 * parce que lui seul connait la pose a l'instant t. Le faire ici obligerait a
 * lire le lacet d'ARRIVEE de l'expression pendant que le moteur, lui, morphe
 * encore — et les yeux sautaient a chaque changement d'humeur.
 */
export function lookTarget({ nx, ny, tour }: Aim): Look {
  return {
    yaw: -TURN + nx * YAW_MAX,
    // tangage positif = regard vers le haut, alors que le y de l'ecran descend
    pitchOffset: tour * -ny * PITCH_MAX,
    mix: tour,
    spin: SPIN * (1 - tour)
  }
}
