import { describe, expect, it } from 'vitest'
import { BotEngine } from './engine'
import { radiusAtAngle } from './shape'
import { SHAPE_BY_ID } from './skins'
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

  it('reste rejouable PENDANT un fondu entre etats', () => {
    // le piege : purger l'etat precedent une fois le fondu fini rend cette
    // date irrecuperable, et le fondu disparait a la relecture
    const e = new BotEngine(100, 'idle')
    e.setState('egg', 1)
    const pendant = e.sample(1.2).bodyPath
    e.sample(3)
    expect(e.sample(1.2).bodyPath).toBe(pendant)
  })

  it('ne part pas dans le decor sur une date anterieure au changement d etat', () => {
    // avant le changement, il n'y a rien a fondre : on doit voir l'etat sortant
    const e = new BotEngine(100, 'idle')
    const avant = e.sample(0.5).bodyPath
    e.setState('egg', 1)
    expect(e.sample(0.5).bodyPath).toBe(avant)
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

describe('forme personnalisee', () => {
  const radii = (id: string) => SHAPE_BY_ID.get(id)!.radii
  const hauteur = (e: BotEngine, t: number) => footprint(e.sample(t).bodyPath).h

  it('remplace la silhouette des etats au repos', () => {
    const rond = new BotEngine(100, 'idle')
    const goutte = new BotEngine(100, 'idle', radii('goutte'))
    expect(goutte.sample(1).bodyPath).not.toBe(rond.sample(1).bodyPath)
  })

  it('laisse intacts les etats qui dessinent leur propre forme', () => {
    for (const id of ['exclaim', 'alert', 'sleep', 'egg', 'hexagon'] as const) {
      const nu = new BotEngine(100, id)
      const habille = new BotEngine(100, id, radii('goutte'))
      expect(habille.sample(1).bodyPath).toBe(nu.sample(1).bodyPath)
    }
  })

  it('morphe vers la nouvelle forme au lieu de sauter', () => {
    const e = new BotEngine(100, 'idle', radii('cercle'))
    // le cercle fait 2.0 de haut, la capsule 1.24 : la hauteur est parlante
    expect(hauteur(e, 1)).toBeCloseTo(2, 1)
    e.setShape(radii('capsule'), 1)

    const etapes = [1.06, 1.14, 1.26].map((t) => hauteur(e, t))
    // strictement decroissant, et jamais deja arrive
    for (let i = 1; i < etapes.length; i++) {
      expect(etapes[i]!).toBeLessThan(etapes[i - 1]!)
    }
    expect(etapes[0]!).toBeLessThan(2)
    expect(etapes[etapes.length - 1]!).toBeGreaterThan(1.24)

    // arrive apres la duree du morph
    expect(hauteur(e, 1 + BotEngine.SHAPE_MORPH + 0.05)).toBeCloseTo(1.24, 1)
  })

  it('reste une fonction pure du temps pendant un morph de forme', () => {
    const e = new BotEngine(100, 'idle', radii('cercle'))
    e.setShape(radii('capsule'), 1)
    const milieu = e.sample(1.1).bodyPath
    // on depasse la fin du morph, puis on relit la date passee
    e.sample(3)
    expect(e.sample(1.1).bodyPath).toBe(milieu)
  })

  it('garde les yeux dans la silhouette sur une forme non circulaire', () => {
    for (const id of ['nuage', 'capsule', 'goutte', 'triangle', 'squircle'] as const) {
      const f = new BotEngine(100, 'idle', radii(id)).sample(1)
      expect(f.eyes).toHaveLength(2)
      for (const eye of f.eyes) {
        const parts = /matrix\(([^)]+)\)/.exec(eye.matrix)![1]!.split(',').map(Number)
        const ex = parts[4]!
        const ey = parts[5]!
        const bord = radiusAtAngle(radii(id), Math.atan2(ey, ex)) * 100
        // le centre de l'oeil doit rester franchement a l'interieur du contour
        expect(Math.hypot(ex, ey)).toBeLessThan(bord)
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

describe('regard qui suit le pointeur', () => {
  /** Abscisse de l'oeil interieur, en px de viewBox. */
  const oeilX = (e: BotEngine, t: number) => +/matrix\([^,]+,[^,]+,[^,]+,[^,]+,(-?[\d.]+)/
    .exec(e.sample(t).eyes[0]!.matrix)![1]!

  /** Amplitude de son deplacement sur une plage de temps. */
  function amplitude(e: BotEngine, de: number, a: number) {
    const xs: number[] = []
    for (let t = de; t <= a; t += 0.1) xs.push(oeilX(e, t))
    return Math.max(...xs) - Math.min(...xs)
  }

  it('ne touche pas au regard tant qu aucune cible n est posee', () => {
    const nu = new BotEngine(100, 'idle')
    const vise = new BotEngine(100, 'idle')
    vise.setLook(null, 0)
    expect(vise.sample(1).eyes[0]!.matrix).toBe(nu.sample(1).eyes[0]!.matrix)
  })

  it('porte le regard du cote de la cible', () => {
    const centre = new BotEngine(100, 'idle')
    const droite = new BotEngine(100, 'idle')
    const gauche = new BotEngine(100, 'idle')
    droite.setLook({ yaw: 20, pitch: 0, mix: 1 }, 0)
    gauche.setLook({ yaw: -20, pitch: 0, mix: 1 }, 0)
    // apres le rattrapage, l oeil est franchement decale, et des deux cotes
    const t = 1 + BotEngine.LOOK_MORPH
    expect(oeilX(droite, t)).toBeGreaterThan(oeilX(centre, t) + 10)
    expect(oeilX(gauche, t)).toBeLessThan(oeilX(centre, t) - 10)
  })

  it('garde les deux yeux visibles aux amplitudes extremes', () => {
    // au-dela, l oeil exterieur passe derriere le limbe de la sphere et le
    // moteur le retire : la butee de GrokBot.vue doit rester en dessous
    for (const yaw of [-20, 0, 20]) {
      for (const pitch of [-13, 0, 13]) {
        const e = new BotEngine(100, 'idle')
        e.setLook({ yaw, pitch, mix: 1 }, 0)
        expect(e.sample(1).eyes, `yaw ${yaw} pitch ${pitch}`).toHaveLength(2)
      }
    }
  })

  it('eteint la derive automatique quand le pointeur commande', () => {
    const libre = new BotEngine(100, 'idle')
    const tenu = new BotEngine(100, 'idle')
    tenu.setLook({ yaw: 0, pitch: 0, mix: 1 }, 0)

    // Meme cible que le regard de repos (ecart nul) : ce qui reste de mouvement
    // n'est donc QUE la derive. Elle doit s'etre eteinte, a ceci pres que le
    // flottement du corps (±0,006 rayon, `float`) n'est pas concerne.
    expect(amplitude(tenu, 1, 8)).toBeLessThan(2)
    expect(amplitude(libre, 1, 8)).toBeGreaterThan(5 * amplitude(tenu, 1, 8))
  })

  it('revient au regard de l etat quand la cible est relachee', () => {
    const nu = new BotEngine(100, 'idle')
    const e = new BotEngine(100, 'idle')
    e.setLook({ yaw: 20, pitch: -10, mix: 1 }, 0)
    e.sample(1)
    e.setLook(null, 1)
    // le retour est progressif, puis complet
    expect(oeilX(e, 1.05)).not.toBeCloseTo(oeilX(nu, 1.05), 1)
    const fini = 1 + BotEngine.LOOK_MORPH
    expect(oeilX(e, fini)).toBeCloseTo(oeilX(nu, fini), 5)
  })

  it('reste une fonction pure du temps pendant le rattrapage', () => {
    const e = new BotEngine(100, 'idle')
    e.setLook({ yaw: 18, pitch: -8, mix: 1 }, 1)
    const milieu = e.sample(1.1).eyes[0]!.matrix
    // relire une date passee doit redonner exactement la meme image
    e.sample(3)
    expect(e.sample(1.1).eyes[0]!.matrix).toBe(milieu)
  })

  it('laisse la derive intacte sur les vignettes, qui ne visent jamais', () => {
    // une vignette figee n appelle pas setLook : son regard doit deriver comme avant
    const e = new BotEngine(100, 'idle')
    expect(amplitude(e, 0, 6)).toBeGreaterThan(4)
  })
})
