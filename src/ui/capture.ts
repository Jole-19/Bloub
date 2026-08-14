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

import { createApp, h, nextTick, ref } from 'vue'
import BloubBot from '@/components/BloubBot.vue'
import { gifAnime, svgAnime } from './anime'
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
 * Rasterise un SVG dans un canvas et rend son contexte.
 *
 * Passe par un blob et non par une `data:` URL : `btoa` casse sur les accents de
 * l'`aria-label`, et l'encodage en pourcents d'un SVG entier est inutilement
 * long. L'URL est relachee dans un `finally` — un objet non revoque tient le blob
 * en memoire jusqu'au rechargement de la page.
 *
 * Le canvas n'est jamais souille : le SVG du bot n'a ni `<foreignObject>` ni
 * `<image>`, les deux seules choses qui feraient echouer `toBlob`.
 */
async function dessine(markup: string, taille: number, canvas: HTMLCanvasElement) {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()

    canvas.width = taille
    canvas.height = taille
    // `alpha` par defaut : c'est ce qui laisse le fond transparent. Le bot
    // s'exporte donc en vignette detachee, posable sur n'importe quel fond.
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    // Le canvas est reutilise d'une image a l'autre pour l'export anime : sans
    // effacement, une image aux yeux fermes garderait les yeux ouverts dessous.
    ctx.clearRect(0, 0, taille, taille)
    ctx.drawImage(img, 0, 0, taille, taille)
    return ctx
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Rasterise un SVG en PNG. Le PNG est sans perte, il n'a pas de qualite a regler. */
export async function versPng(markup: string, taille: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await dessine(markup, taille, canvas)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encodage png impossible'))),
      'image/png'
    )
  })
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

/** Ce que le bot doit porter sur l'animation exportee. */
export interface ReglagesBot {
  shape: string
  color: string
  expression: string
}

/**
 * Rend la sequence image par image, sur une instance HORS ECRAN.
 *
 * Pas de capture de l'avatar affiche, et c'est deliberé : a l'ecran le bot est
 * a une date d'horloge quelconque, alors qu'ici on veut une sequence
 * reproductible qui commence au debut. C'est possible parce que `engine.sample(t)`
 * est une fonction pure du temps — la meme date redonne toujours la meme image —
 * et parce qu'un `BloubBot` a qui on donne `frozenAt` ne lance aucune boucle
 * d'animation ni aucun ecouteur : on le fait avancer nous-memes.
 *
 * Le meme composant sert donc a l'ecran et a l'export : une seule source de
 * dessin, aucune chance de derive.
 */
export async function sequenceDuBot<T>(
  reglages: ReglagesBot,
  taille: number,
  nombre: number,
  pas: number,
  lis: (svg: SVGSVGElement, index: number) => T | Promise<T>
): Promise<T[]> {
  const hote = document.createElement('div')
  // hors du flux et hors de vue, mais RENDU : un `display:none` ne donnerait pas
  // de SVG a serialiser.
  hote.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(hote)

  const date = ref(0)
  const app = createApp({
    render: () => h(BloubBot, { ...reglages, size: taille, frozenAt: date.value })
  })
  app.mount(hote)

  try {
    const out: T[] = []
    for (let i = 0; i < nombre; i++) {
      date.value = i * pas
      await nextTick()
      const svg = hote.querySelector('svg')
      if (!svg) throw new Error('bot hors ecran non rendu')
      out.push(await lis(svg, i))
    }
    return out
  } finally {
    app.unmount()
    hote.remove()
  }
}

/**
 * Les matrices des yeux d'une image, lues sur le masque.
 *
 * Les yeux sont les seules formes du masque a porter un `transform` — le corps
 * n'en a pas — donc l'ordre du document suffit a les identifier.
 */
function matricesDesYeux(svg: SVGSVGElement) {
  return [...svg.querySelectorAll('mask [transform]')].map((e) => e.getAttribute('transform')!)
}

/**
 * Assemble l'animation du bot en un SVG anime.
 *
 * Le corps est celui de la premiere image et n'est pas anime : au repos la
 * silhouette ne se deplace que de 1,17 unite sur un rayon de 100, soit environ un
 * pixel et demi. Tout le mouvement est dans les yeux.
 */
export async function versSvgAnime(
  reglages: ReglagesBot,
  taille: number,
  nombre: number,
  pas: number
): Promise<Blob> {
  let base = ''
  const matrices = await sequenceDuBot(reglages, taille, nombre, pas, (svg, i) => {
    if (i === 0) base = svgAutonome(svg, taille)
    return matricesDesYeux(svg)
  })
  const markup = svgAnime(base, matrices, +((nombre - 1) * pas).toFixed(3))
  return new Blob([markup], { type: 'image/svg+xml' })
}

/**
 * Assemble l'animation du bot en GIF anime.
 *
 * Le GIF est un vrai feuilletage : il faut donc rasteriser chaque image, la ou le
 * SVG anime ne collecte que des matrices. Il n'existe que pour les endroits qui
 * refusent le SVG — un avatar anime Discord ou Slack — et son bord sera dur, sa
 * transparence n'ayant qu'un bit.
 */
export async function versGifAnime(
  reglages: ReglagesBot,
  taille: number,
  nombre: number,
  pas: number
): Promise<Blob> {
  // Un seul canvas pour toute la sequence : en creer un par image laisse des
  // dizaines de contextes au ramasse-miettes pendant l'export.
  const canvas = document.createElement('canvas')
  const images = await sequenceDuBot(reglages, taille, nombre, pas, async (svg) => {
    const ctx = await dessine(svgAutonome(svg, taille), taille, canvas)
    return ctx.getImageData(0, 0, taille, taille).data
  })
  return new Blob([gifAnime(images, taille, taille, Math.round(pas * 1000))], { type: 'image/gif' })
}
