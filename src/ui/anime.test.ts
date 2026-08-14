import { describe, expect, it } from 'vitest'
import { svgAnime } from './anime'

/** SVG minimal ayant la structure de celui de BloubBot : corps + deux yeux. */
const BASE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-125 -125 250 250">' +
  '<defs><mask id="m" maskUnits="userSpaceOnUse">' +
  '<path d="M61 0C62 2Z" fill="#fff"/>' +
  '<path d="M-9 -11A9 9Z" fill="#000" transform="matrix(0.86,-0.32,0.45,0.84,14.85,-27.88)"/>' +
  '<path d="M-9 -11A9 9Z" fill="#000" transform="matrix(0.62,-0.05,0.45,0.84,35.2,-29.43)"/>' +
  '</mask></defs>' +
  '<g opacity="1"><path d="M61 0C62 2Z" fill="#f9f9f9"/>' +
  '<g mask="url(#m)"><rect x="-125" y="-125" width="250" height="250" fill="#0a0a0c"/></g></g>' +
  '</svg>'

const MATRICES = [
  ['matrix(1,0,0,1,0,0)', 'matrix(1,0,0,1,10,0)'],
  ['matrix(1,0,0,0.35,0,0)', 'matrix(1,0,0,0.35,10,0)'],
  ['matrix(1,0,0,1,2,0)', 'matrix(1,0,0,1,12,0)']
]

describe('svg anime', () => {
  const sortie = svgAnime(BASE, MATRICES, 3)

  it('remplace le transform de chaque oeil par une classe', () => {
    expect(sortie).toContain('class="oeil0"')
    expect(sortie).toContain('class="oeil1"')
    // plus aucun transform en dur dans le masque
    expect(sortie.match(/<mask[\s\S]*?<\/mask>/)![0]).not.toContain('transform="matrix')
  })

  it('laisse le corps intact', () => {
    // la silhouette ne bouge pas assez pour etre animee : 1,17u sur un rayon de 100
    expect(sortie).toContain('<path d="M61 0C62 2Z" fill="#fff"/>')
    expect(sortie).toContain('fill="#0a0a0c"')
    expect(sortie).toContain('mask="url(#m)"')
  })

  it('ecrit une regle de keyframes par oeil, aux bons pourcentages', () => {
    expect(sortie).toContain('@keyframes oeil0{0%{transform:matrix(1,0,0,1,0,0)}')
    expect(sortie).toContain('50%{transform:matrix(1,0,0,0.35,0,0)}')
    expect(sortie).toContain('100%{transform:matrix(1,0,0,1,2,0)}')
    expect(sortie).toContain('@keyframes oeil1{')
  })

  /*
   * Sans ces deux proprietes une transformation CSS sur un element SVG tourne
   * autour du centre de sa boite au lieu de l'origine du repere.
   */
  it('cale le repere des transformations CSS sur le viewBox', () => {
    expect(sortie).toContain('transform-box:view-box')
    expect(sortie).toContain('transform-origin:0 0')
  })

  /* La derive n'est pas periodique : sans `alternate`, le raccord sauterait. */
  it('reboucle en aller-retour pour ne pas montrer de raccord', () => {
    expect(sortie).toContain('animation-direction:alternate')
    expect(sortie).toContain('animation-iteration-count:infinite')
    expect(sortie).toContain('animation-duration:3s')
  })

  it('reste un SVG bien forme et autonome', () => {
    expect(sortie.startsWith('<svg xmlns=')).toBe(true)
    expect(sortie.endsWith('</svg>')).toBe(true)
    expect(sortie.indexOf('<style>')).toBeLessThan(sortie.indexOf('</svg>'))
  })

  it('pese une fraction d une animation bitmap', () => {
    // 3 images cles ici, mais l'ordre de grandeur est le point : quelques ko
    expect(sortie.length).toBeLessThan(4000)
  })

  it('refuse ce qu il ne sait pas animer', () => {
    expect(() => svgAnime(BASE, [MATRICES[0]!], 3)).toThrow()
    expect(() => svgAnime('<svg></svg>', MATRICES, 3)).toThrow()
    // autant de matrices par image cle que d'yeux dans le masque
    expect(() => svgAnime(BASE, [['matrix(1,0,0,1,0,0)'], ['matrix(1,0,0,1,1,0)']], 3)).toThrow()
  })
})
