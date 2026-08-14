/**
 * Assemblage de l'animation exportee : un SVG dont les yeux sont animes en CSS.
 *
 * Tout est pur — de la chaine vers de la chaine — donc testable en `node` comme le
 * reste de `src/ui/`. C'est la capture des images cles qui a besoin du DOM, et elle
 * vit dans `capture.ts`.
 */

/** Ecrit un entier non signe sur `n` octets, petit-boutiste. */
function le(valeur: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((valeur / 2 ** (8 * i)) & 0xff)
  return out
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

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

/* ------------------------------------------------------------------- gif */

/**
 * Compression LZW du GIF : codes de longueur VARIABLE, ecrits bit a bit en
 * commencant par le bit de poids faible, et regroupes en sous-blocs de 255 octets
 * au plus.
 */
function lzw(indices: Uint8Array, bitsParPixel: number): number[] {
  const clear = 1 << bitsParPixel
  const fin = clear + 1
  let taille = bitsParPixel + 1
  let suivant = fin + 1
  let dico = new Map<string, number>()

  const octets: number[] = []
  let reserve = 0
  let bits = 0
  const ecris = (code: number) => {
    reserve |= code << bits
    bits += taille
    while (bits >= 8) {
      octets.push(reserve & 0xff)
      reserve >>= 8
      bits -= 8
    }
  }

  ecris(clear)
  let prefixe = String(indices[0])
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]!
    const cle = `${prefixe},${c}`
    const connu = dico.get(cle)
    if (connu !== undefined) {
      prefixe = String(connu)
      continue
    }
    ecris(Number(prefixe))
    if (suivant < 4096) {
      dico.set(cle, suivant++)
      // La largeur du code grandit un cran APRES que le dictionnaire ait
      // depasse ce qu'elle adresse, et ce decalage est le piege du format :
      // l'encodeur inscrit son entree juste apres avoir emis un code, alors que
      // le decodeur n'inscrit la sienne qu'en lisant le code SUIVANT. Il est donc
      // toujours en retard d'une entree, et l'encodeur doit elargir en retard
      // aussi. Ecrire `=== (1 << taille)` desynchronise les deux et le flux
      // devient illisible — verifie par un test d'aller-retour.
      if (suivant > 1 << taille && taille < 12) taille++
    } else {
      // Dictionnaire plein : on le repart a zero, le decodeur fait pareil en
      // voyant le code de remise a zero.
      ecris(clear)
      dico = new Map()
      taille = bitsParPixel + 1
      suivant = fin + 1
    }
    prefixe = String(c)
  }
  ecris(Number(prefixe))
  ecris(fin)
  if (bits > 0) octets.push(reserve & 0xff)

  // Decoupage en sous-blocs : chacun est precede de sa longueur, et un octet nul
  // termine la serie.
  const sortie: number[] = [bitsParPixel]
  for (let i = 0; i < octets.length; i += 255) {
    const bloc = octets.slice(i, i + 255)
    sortie.push(bloc.length, ...bloc)
  }
  sortie.push(0)
  return sortie
}

/** Palette commune a toutes les images, index 0 reserve au transparent. */
function palette(images: Uint8ClampedArray[]) {
  const vues = new Map<number, number>()
  for (const px of images) {
    for (let p = 0; p < px.length; p += 4) {
      if (px[p + 3]! < 128) continue
      const cle = (px[p]! << 16) | (px[p + 1]! << 8) | px[p + 2]!
      if (!vues.has(cle)) vues.set(cle, vues.size + 1)
      if (vues.size >= 255) break
    }
  }
  return vues
}

/**
 * Assemble des images en GIF anime.
 *
 * La transparence du GIF est sur UN bit : un pixel est opaque ou invisible, rien
 * entre les deux. Sur un fond transparent, le bord antialiase de la boule est donc
 * tranche a 50 % d'opacite et ressort en marches d'escalier. Ce n'est pas un defaut
 * a corriger, c'est le format — d'ou le choix laisse a l'utilisateur entre ce bord
 * dur et un fond plein, ou le bord reste lisse parce qu'il a de quoi se fondre.
 *
 * La transparence est DEDUITE des images, pas demandee : des images deja aplaties
 * sur un fond n'ont pas a declarer d'index transparent, et surtout pas a etre
 * eliminees « retour au fond » entre deux — ce qui ferait clignoter le fond.
 *
 * Le GIF n'existe que pour les endroits qui refusent le SVG anime, comme les
 * avatars animes de Discord ou de Slack. Partout ailleurs le SVG est meilleur.
 */
export function gifAnime(
  images: Uint8ClampedArray[],
  largeur: number,
  hauteur: number,
  delaiMs: number
): Uint8Array<ArrayBuffer> {
  if (!images.length) throw new Error('aucune image a emballer')

  const transparence = images.some((px) => {
    for (let p = 3; p < px.length; p += 4) if (px[p]! < 128) return true
    return false
  })

  const couleurs = palette(images)
  // Une palette GIF a une taille en puissance de deux, et il faut au moins deux
  // bits par pixel pour que le code de remise a zero tienne.
  const bits = Math.max(2, Math.ceil(Math.log2(couleurs.size + 1)))
  const tailleTable = 1 << bits

  const table: number[] = [0, 0, 0] // index 0 : le transparent, couleur sans importance
  for (const cle of couleurs.keys()) table.push((cle >> 16) & 0xff, (cle >> 8) & 0xff, cle & 0xff)
  while (table.length < tailleTable * 3) table.push(0)

  const out: number[] = [
    ...ascii('GIF89a'),
    ...le(largeur, 2),
    ...le(hauteur, 2),
    0x80 | (bits - 1), // table globale presente, et sa taille
    0, // index de fond : le transparent
    0, // pas de rapport d'aspect
    ...table,
    // Boucle sans fin, par l'extension Netscape — rien d'autre ne sait le dire.
    0x21,
    0xff,
    0x0b,
    ...ascii('NETSCAPE2.0'),
    0x03,
    0x01,
    ...le(0, 2),
    0x00
  ]

  // Le delai du GIF se compte en CENTIEMES de seconde : c'est ce qui limite sa
  // cadence, un delai de 0 ou 1 etant traite differemment selon les lecteurs.
  const delai = Math.max(2, Math.round(delaiMs / 10))

  for (const px of images) {
    const indices = new Uint8Array(largeur * hauteur)
    for (let i = 0, p = 0; i < indices.length; i++, p += 4) {
      if (px[p + 3]! < 128) continue // reste a 0, donc transparent
      const cle = (px[p]! << 16) | (px[p + 1]! << 8) | px[p + 2]!
      indices[i] = couleurs.get(cle) ?? 1
    }
    out.push(
      0x21,
      0xf9,
      0x04,
      // Sur fond transparent : elimination « retour au fond » (2) et index
      // transparent declare, sinon les zones vides laissent voir l'image
      // precedente et la boule traine derriere elle.
      //
      // Sur fond plein : « laisser en place » (1), et surtout PAS de retour au
      // fond — chaque image couvre toute la toile, donc effacer entre deux ne
      // sert qu'a faire clignoter le fond.
      transparence ? (2 << 2) | 0x01 : 1 << 2,
      ...le(delai, 2),
      0, // index transparent
      0x00,
      0x2c,
      ...le(0, 2),
      ...le(0, 2),
      ...le(largeur, 2),
      ...le(hauteur, 2),
      0, // pas de table locale, pas d'entrelacement
      ...lzw(indices, bits)
    )
  }

  out.push(0x3b)
  return new Uint8Array(out)
}
