/**
 * Encodage video de l'animation, en MP4.
 *
 * Seul module du projet a dependre d'autre chose que Vue, et il le fait en import
 * DYNAMIQUE : mediabunny pese 43 ko gzip en import statique, soit plus que les
 * 34 ko qui avaient fait ecarter `vue-i18n` au profit d'une couche maison. Charge
 * a la demande, il ne coute que 0,7 ko au chargement du site et n'arrive que le
 * jour ou quelqu'un exporte une video.
 *
 * Ecrire le conteneur a la main comme pour le GIF et le WebP n'etait pas tenable
 * ici : un MP4 demande tout l'arbre de boites ISO BMFF et ses tables
 * d'echantillons, la ou un GIF tient en quelques centaines de lignes.
 *
 * La video est forcement OPAQUE. Verifie sur place : `VideoEncoder` refuse
 * `alpha: 'keep'`, en H.264 comme en VP9. C'est pour ca que l'export video impose
 * un fond, la ou le GIF laisse le choix.
 */

/** Le navigateur sait-il encoder une video ici ? */
export function videoPossible() {
  return typeof VideoEncoder !== 'undefined'
}

/**
 * Encode une suite d'images en MP4.
 *
 * `rend` dessine l'image `i` DANS le canvas fourni, puis rend la main. Les images
 * ne sont jamais accumulees : chacune est encodee et jetee avant la suivante,
 * sans quoi un cycle de trente secondes tiendrait 255 Mo de pixels bruts en
 * memoire.
 */
export async function versMp4(
  canvas: HTMLCanvasElement,
  images: number,
  fps: number,
  rend: (index: number) => void | Promise<void>,
  avance?: (fait: number, total: number) => void
): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } = await import(
    'mediabunny'
  )

  const sortie = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
  sortie.addVideoTrack(source, { frameRate: fps })
  await sortie.start()

  const duree = 1 / fps
  for (let i = 0; i < images; i++) {
    await rend(i)
    // `await` sur chaque image et non en lot : c'est ce qui applique la
    // contre-pression de l'encodeur, donc ce qui borne la memoire.
    await source.add(i * duree, duree)
    avance?.(i + 1, images)
  }

  await sortie.finalize()
  const buffer = sortie.target.buffer
  if (!buffer) throw new Error('encodage mp4 vide')
  return new Blob([buffer], { type: 'video/mp4' })
}
