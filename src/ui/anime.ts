/**
 * Assemblage d'un WebP ANIME a partir d'images WebP fixes.
 *
 * Tout est pur — de l'octet vers de l'octet — donc testable en `node` comme le
 * reste de `src/ui/`. C'est la capture des images qui a besoin du DOM, et elle
 * vit dans `capture.ts`.
 *
 * Aucune dependance, et ce n'est pas de l'entetement : le navigateur sait DEJA
 * encoder une image WebP avec son alpha (`canvas.toBlob('image/webp')`, qui sort
 * un chunk `ALPH`). Il ne sait juste pas les enchainer. Or l'animation WebP n'est
 * qu'un conteneur RIFF autour de ces memes flux : il n'y a rien a compresser
 * ici, seulement a emballer. Une lib WASM de libwebp pesait 100 a 300 ko pour
 * refaire l'emballage que voici.
 *
 * Format : https://developers.google.com/speed/webp/docs/riff_container
 */

/** Ecrit un entier non signe sur `n` octets, petit-boutiste. */
function le(valeur: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((valeur / 2 ** (8 * i)) & 0xff)
  return out
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/**
 * Un chunk RIFF : identifiant, taille, donnees. La taille declaree EXCLUT le
 * bourrage, mais un chunk de longueur impaire est suivi d'un octet nul — l'oublier
 * decale tout ce qui suit.
 */
function chunk(id: string, donnees: ArrayLike<number>): number[] {
  const d = Array.from(donnees)
  const out = [...ascii(id), ...le(d.length, 4), ...d]
  if (d.length % 2) out.push(0)
  return out
}

/** Les morceaux d'un WebP fixe dont une animation a besoin. */
export interface MorceauxWebp {
  /** Chunk complet du flux d'image : `VP8 ` (avec perte) ou `VP8L` (sans perte). */
  image: number[]
  /** Chunk `ALPH` complet, ou `null` : le VP8L porte son alpha lui-meme. */
  alpha: number[] | null
  /** Vrai si cette image a de la transparence, sous une forme ou l'autre. */
  transparente: boolean
}

/**
 * Extrait d'un WebP fixe ce qui doit repartir dans l'animation.
 *
 * On garde `ALPH` et le flux d'image, et on JETTE le reste — en particulier
 * l'`ICCP` que Chrome ajoute : 456 octets de profil de couleur, par image, pour
 * un aplat de deux teintes. Le `VP8X` de l'image fixe est jete aussi, l'animation
 * ecrivant le sien pour la toile entiere.
 */
export function litWebp(fichier: Uint8Array): MorceauxWebp {
  if (fichier.length < 16) throw new Error('webp tronque')
  const lis4 = (o: number) => String.fromCharCode(...fichier.subarray(o, o + 4))
  if (lis4(0) !== 'RIFF' || lis4(8) !== 'WEBP') throw new Error('ce n est pas un webp')

  let image: number[] | null = null
  let alpha: number[] | null = null
  let o = 12
  while (o + 8 <= fichier.length) {
    const id = lis4(o)
    const taille =
      fichier[o + 4]! + fichier[o + 5]! * 256 + fichier[o + 6]! * 65536 + fichier[o + 7]! * 16777216
    const entier = Array.from(fichier.subarray(o, o + 8 + taille + (taille % 2)))
    if (id === 'VP8 ' || id === 'VP8L') image = entier
    else if (id === 'ALPH') alpha = entier
    o += 8 + taille + (taille % 2)
  }
  if (!image) throw new Error('flux d image introuvable')

  // Un VP8L porte son alpha dans son propre flux, sans chunk separe.
  const sansPerte = String.fromCharCode(...image.slice(0, 4)) === 'VP8L'
  return { image, alpha, transparente: alpha !== null || sansPerte }
}

/** Bits du champ de drapeaux du `VP8X`, numerotes depuis le bit de poids fort. */
const DRAPEAU_ANIMATION = 0x02
const DRAPEAU_ALPHA = 0x10

/**
 * « Ne pas fondre » : l'image REMPLACE le rectangle au lieu de se composer sur la
 * precedente. Indispensable ici — nos images ont des zones transparentes, et en
 * fondu l'image d'avant resterait visible au travers. C'est ce qui produit les
 * trainees fantomes dans les animations mal emballees.
 */
const NE_PAS_FONDRE = 0x02

/** Boucle sans fin. */
const BOUCLE_INFINIE = 0

/**
 * Emballe des images WebP fixes en une animation.
 *
 * `dureeImage` est en millisecondes et vaut pour toutes les images.
 */
export function webpAnime(
  images: Uint8Array[],
  largeur: number,
  hauteur: number,
  dureeImage: number
): Uint8Array<ArrayBuffer> {
  if (!images.length) throw new Error('aucune image a emballer')

  const morceaux = images.map(litWebp)
  const avecAlpha = morceaux.some((m) => m.transparente)

  const vp8x = chunk('VP8X', [
    DRAPEAU_ANIMATION | (avecAlpha ? DRAPEAU_ALPHA : 0),
    0,
    0,
    0,
    ...le(largeur - 1, 3),
    ...le(hauteur - 1, 3)
  ])

  // Fond transparent (BGRA nul) : rien ne doit se peindre derriere la boule.
  const anim = chunk('ANIM', [0, 0, 0, 0, ...le(BOUCLE_INFINIE, 2)])

  const anmf = morceaux.flatMap((m) =>
    chunk('ANMF', [
      ...le(0, 3), // x, en pas de 2 px
      ...le(0, 3), // y
      ...le(largeur - 1, 3),
      ...le(hauteur - 1, 3),
      ...le(dureeImage, 3),
      NE_PAS_FONDRE,
      ...(m.alpha ?? []),
      ...m.image
    ])
  )

  const corps = [...ascii('WEBP'), ...vp8x, ...anim, ...anmf]
  // La taille declaree par le RIFF part APRES son propre champ de taille.
  return new Uint8Array([...ascii('RIFF'), ...le(corps.length, 4), ...corps])
}
