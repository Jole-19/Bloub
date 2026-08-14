/**
 * Capture de l'avatar en image. C'est la couche DOM de l'export : elle a besoin
 * d'un canvas et du presse-papiers, donc rien ici n'est testable en `node` — le
 * cadrage et le nommage, eux, vivent dans `export.ts` et le sont.
 *
 * Le SVG exporte est celui de l'ECRAN, recadre : on serialise le noeud vivant
 * plutot que de reconstruire un rendu a cote. Deux sources de dessin auraient
 * derive, et le moteur est deja la seule qui vaille. C'est possible parce que le
 * SVG du bot est deja auto-porteur : aucune `var(--...)`, aucune classe, chaque
 * forme porte son `fill` en hex.
 */

import { sansCommentaires, viewBoxExport } from './export'

/**
 * Serialise le SVG affiche en un document autonome, recadre sur la boule.
 *
 * `width`/`height` sont poses explicitement et ce n'est pas cosmetique : sans
 * dimension intrinseque, Firefox refuse de rasteriser un SVG charge dans une
 * `<img>`, et le canvas ressort vide.
 */
export function svgAutonome(svg: SVGSVGElement, taille: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // Les classes Tailwind de la page n'existent pas dans le fichier livre.
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', viewBoxExport())
  clone.setAttribute('width', String(taille))
  clone.setAttribute('height', String(taille))
  return sansCommentaires(new XMLSerializer().serializeToString(clone))
}

/**
 * Rasterise un SVG en PNG.
 *
 * Passe par un blob et non par une `data:` URL : `btoa` casse sur les accents de
 * l'`aria-label`, et l'encodage en pourcents d'un SVG entier est inutilement
 * long. L'URL est relachee dans un `finally` — un objet non revoque tient le
 * blob en memoire jusqu'au rechargement de la page.
 *
 * Le canvas n'est jamais souille : le SVG du bot n'a ni `<foreignObject>` ni
 * `<image>`, les deux seules choses qui feraient echouer `toBlob`.
 */
export async function versPng(markup: string, taille: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = taille
    canvas.height = taille
    // `alpha` par defaut : c'est ce qui laisse le fond transparent. Le bot
    // s'exporte donc en vignette detachee, posable sur n'importe quel fond.
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    ctx.drawImage(img, 0, 0, taille, taille)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('encodage png impossible'))),
        'image/png'
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Declenche le telechargement d'un blob sous le nom donne. */
export function telecharge(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = nom
    a.click()
  } finally {
    // Differe : Safari lit encore l'URL apres le clic sur un gros blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

/** Le presse-papiers sait-il ecrire une image ici ? */
export function copiePossible() {
  return (
    typeof ClipboardItem !== 'undefined' &&
    !!navigator.clipboard?.write &&
    // `supports` est recent : son absence n'est pas un refus.
    (ClipboardItem.supports?.('image/png') ?? true)
  )
}

/**
 * Copie une image dans le presse-papiers.
 *
 * Le blob est passe en PROMESSE et non attendu avant l'appel : Safari exige que
 * `write` part du geste de l'utilisateur, or tout `await` glisse entre les deux
 * perd ce geste et la copie est refusee.
 */
export async function copie(blob: Promise<Blob>) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/**
 * Copie le SVG en TEXTE et non comme image : c'est sous cette forme que Figma,
 * Illustrator et un editeur de code le collent en vectoriel modifiable. Colle en
 * `image/svg+xml`, il ressortirait aplati la ou il ressort editable ici.
 */
export async function copieTexte(texte: string) {
  await navigator.clipboard.writeText(texte)
}
