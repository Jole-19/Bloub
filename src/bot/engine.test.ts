import { describe, expect, it } from 'vitest'
import { BotEngine } from './engine'
import { SEQUENCE, STATES, type StateId } from './states'

/** Points d'ancrage d'un path genere par closedPath (on ignore les controles). */
function anchors(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const head = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)
  if (head) out.push([+head[1]!, +head[2]!])
  for (const seg of d.matchAll(/C[-\d. ]+? (-?[\d.]+) (-?[\d.]+)(?=C|Z)/g)) {
    out.push([+seg[1]!, +seg[2]!])
  }
  return out
}

function footprint(d: string) {
  const pts = anchors(d)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return {
    w: (Math.max(...xs) - Math.min(...xs)) / 100,
    h: (Math.max(...ys) - Math.min(...ys)) / 100
  }
}

/** Empreintes relevees sur la video (largeur x hauteur, en diametres de boule). */
const EMPREINTES: Array<[StateId, number, number, number, number]> = [
  // etat,        date,  largeur, hauteur, tolerance
  ['idle', 0.5, 2.0, 2.0, 0.05],
  ['egg', 0.9, 1.653, 2.0, 0.06],
  ['hexagon', 0.9, 1.82, 2.01, 0.07],
  ['exclaim', 0.9, 0.263, 0.842, 0.03],
  ['alert', 0.8, 0.421, 0.753, 0.04],
  ['sleep', 0.6, 0.317, 0.317, 0.03],
  ['comet', 1.0, 0.258, 0.258, 0.03]
]

describe('silhouettes', () => {
  for (const [id, t, w, h, tol] of EMPREINTES) {
    it(`"${id}" a l empreinte mesuree sur la video`, () => {
      const e = new BotEngine(100, id)
      const { w: gw, h: gh } = footprint(e.sample(t).bodyPath)
      expect(Math.abs(gw - w)).toBeLessThan(tol)
      expect(Math.abs(gh - h)).toBeLessThan(tol)
    })
  }

  it('la boule au repos est un cercle, pas un ovale', () => {
    const e = new BotEngine(100, 'idle')
    const { w, h } = footprint(e.sample(0.5).bodyPath)
    expect(Math.abs(w - h)).toBeLessThan(0.03)
  })

  it('le triangle est plus large que haut, pointe en haut', () => {
    const e = new BotEngine(100, 'play')
    const { w, h } = footprint(e.sample(0.9).bodyPath)
    expect(w).toBeGreaterThan(h)
    expect(Math.abs(w - 1.99)).toBeLessThan(0.08)
  })
})

describe('moteur', () => {
  it('est une fonction pure du temps : deux lectures a la meme date sont identiques', () => {
    const a = new BotEngine(100, 'orbit')
    const b = new BotEngine(100, 'orbit')
    expect(a.sample(1.3).bodyPath).toBe(b.sample(1.3).bodyPath)
    // et relire une date deja passee redonne la meme image
    const first = a.sample(0.7).bodyPath
    a.sample(2.5)
    expect(a.sample(0.7).bodyPath).toBe(first)
  })

  it('anime vraiment : la forme evolue entre deux dates', () => {
    const e = new BotEngine(100, 'thinking')
    const paths = [0.1, 0.4, 0.8, 1.2].map((t) => e.sample(t).bodyPath)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('interpole la silhouette pendant une transition, sans saut', () => {
    const e = new BotEngine(100, 'idle')
    e.setState('egg', 1)
    const largeurs = [1, 1.1, 1.2, 1.3, 1.4].map((t) => footprint(e.sample(t).bodyPath).w)
    // strictement decroissant : la boule se retrecit vers l'oeuf
    for (let i = 1; i < largeurs.length; i++) {
      expect(largeurs[i]!).toBeLessThan(largeurs[i - 1]!)
    }
    expect(largeurs[0]!).toBeCloseTo(2, 1)
    expect(footprint(e.sample(2).bodyPath).w).toBeCloseTo(1.65, 1)
  })

  it('ne fait jamais depasser le corps du viewBox', () => {
    for (const s of STATES) {
      const e = new BotEngine(100, s.id)
      for (const t of [0.2, 0.9, 1.8, 3]) {
        const pts = anchors(e.sample(t).bodyPath)
        for (const [x, y] of pts) {
          expect(Math.abs(x)).toBeLessThan(158)
          expect(Math.abs(y)).toBeLessThan(158)
        }
      }
    }
  })
})

describe('etats', () => {
  it('expose les 14 etats de la video, tous dans la sequence', () => {
    expect(STATES).toHaveLength(14)
    expect(new Set(SEQUENCE)).toEqual(new Set(STATES.map((s) => s.id)))
  })

  it('montre le visage sur les etats a visage, le cache sur les autres', () => {
    const avec: StateId[] = ['idle', 'wink', 'wide', 'notify', 'egg', 'hexagon']
    const sans: StateId[] = ['thinking', 'alert', 'exclaim', 'sleep']
    for (const id of avec) expect(new BotEngine(100, id).sample(0.9).eyes.length).toBe(2)
    for (const id of sans) expect(new BotEngine(100, id).sample(0.9).eyes.length).toBe(0)
  })

  it('creuse une encoche autour de la pastille de notification', () => {
    const f = new BotEngine(100, 'notify').sample(1)
    expect(f.notif).not.toBeNull()
    expect(f.notch).not.toBeNull()
    // marge constante mesuree : 0.054 rayon
    expect((f.notch!.r - f.notif!.r) / 100).toBeCloseTo(0.054, 2)
    // la pastille est posee sur la circonference
    expect(Math.hypot(f.notif!.x, f.notif!.y) / 100).toBeCloseTo(1.003, 1)
  })

  it('trace les anneaux devant ET derriere le corps', () => {
    const f = new BotEngine(100, 'orbit').sample(1.4)
    expect(f.arcs.length).toBeGreaterThan(3)
    expect(f.arcs.some((a) => a.back.length > 0)).toBe(true)
    expect(f.arcs.some((a) => a.front.length > 0)).toBe(true)
  })

  it('fait spiraler les particules vers le centre pendant l eclatement', () => {
    const e = new BotEngine(100, 'burst')
    const rayon = (t: number) => {
      const d = e.sample(t).dots[0]
      return d ? Math.hypot(d.x, d.y) : 0
    }
    expect(rayon(0.15)).toBeGreaterThan(rayon(0.45))
    expect(rayon(0.45)).toBeGreaterThan(0)
  })
})
