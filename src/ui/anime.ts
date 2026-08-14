/**
 * Assemblage de l'animation exportee : un SVG dont les yeux sont animes en CSS.
 *
 * Tout est pur — de la chaine vers de la chaine — donc testable en `node` comme le
 * reste de `src/ui/`. C'est la capture des images cles qui a besoin du DOM, et elle
 * vit dans `capture.ts`.
 */

/**
 * Injecte l'animation des yeux dans un SVG deja rendu.
 *
 * On ne reconstruit PAS le dessin : on part du SVG que `BloubBot` a produit pour
 * la premiere image et on remplace le `transform` de chaque oeil par une classe
 * animee. Une seule source de dessin, donc aucune derive possible — c'est la
 * meme regle que pour l'export fixe.
 *
 * Seuls les yeux bougent, et c'est mesure : au repos la silhouette ne se deplace
 * que de 1,17 unite sur un rayon de 100 en trois secondes, soit environ un pixel
 * et demi a la taille d'export. Le corps reste donc tel quel, ce qui rend le
 * fichier minuscule — tout le poids d'une animation du bot est dans son regard.
 *
 * L'interpolation est faite par le NAVIGATEUR : c'est ce qui rend l'animation
 * lisse a la frequence de l'ecran au lieu de sauter d'image en image comme un
 * feuilletage. C'est tout l'interet par rapport a un WebP ou un GIF.
 */
export function svgAnime(base: string, matrices: string[][], duree: number): string {
  if (matrices.length < 2) throw new Error('il faut au moins deux images cles')

  const mask = base.match(/<mask[\s\S]*?<\/mask>/)
  if (!mask) throw new Error('masque introuvable')

  // Les yeux sont les seules formes du masque a porter un `transform` : le corps
  // n'en a pas. On les numerote dans l'ordre du document.
  let n = 0
  const maskAnime = mask[0].replace(/transform="matrix\([^)]*\)"/g, () => `class="oeil${n++}"`)
  if (n === 0) throw new Error('aucun oeil a animer')

  const parImage = matrices[0]!.length
  if (parImage !== n) throw new Error(`${n} yeux dans le masque, ${parImage} par image cle`)

  const pas = 100 / (matrices.length - 1)
  const regles = Array.from({ length: n }, (_, oeil) => {
    const etapes = matrices
      .map((m, i) => `${+(i * pas).toFixed(3)}%{transform:${m[oeil]}}`)
      .join('')
    return `@keyframes oeil${oeil}{${etapes}}`
  })

  const style =
    '<style>' +
    // `transform-box`/`transform-origin` ne sont pas decoratifs : sans eux, une
    // transformation CSS sur un element SVG tourne autour du centre de sa boite
    // au lieu de l'origine du repere, et l'oeil part a l'autre bout de la boule.
    `.oeil0,.oeil1{transform-box:view-box;transform-origin:0 0;` +
    // `alternate` donne une boucle SANS COUTURE : la derive du regard n'est pas
    // periodique (ses periodes sont premieres entre elles pour ne jamais se
    // repeter), donc une boucle simple montrerait un saut au raccord. Jouee puis
    // rejouee a l'envers, elle reboucle exactement sur elle-meme — et un
    // clignement a l'envers reste un clignement.
    `animation-duration:${duree}s;animation-iteration-count:infinite;` +
    `animation-timing-function:linear;animation-direction:alternate}` +
    Array.from({ length: n }, (_, i) => `.oeil${i}{animation-name:oeil${i}}`).join('') +
    regles.join('') +
    '</style>'

  return base.replace(mask[0], maskAnime).replace('</svg>', `${style}</svg>`)
}
