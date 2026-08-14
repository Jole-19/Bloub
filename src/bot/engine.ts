import { arcRender, type ArcRender, type DotRender } from './decor'
import { blendExpression, type BotExpression } from './expressions'
import { blinkScale, eyePoses, liveliness } from './face'
import { clamp, easings, lerp, r2 } from './math'
import {
  blend,
  capsulePath,
  closedPath,
  radiusAtAngle,
  toPoints,
  type Point,
  type Silhouette
} from './shape'
import { STATE_BY_ID, STATES, type Pose, type StateDef, type StateId } from './states'

export interface RenderedEye {
  d: string
  matrix: string
  alpha: number
}

export interface BotFrame {
  bodyPath: string
  bodyAlpha: number
  eyes: RenderedEye[]
  dots: DotRender[]
  /** true = les points passent derriere le corps (particules de l'eclatement) */
  dotsBehind: boolean
  arcs: ArcRender[]
  notif: { x: number; y: number; r: number } | null
  notch: { x: number; y: number; r: number } | null
}

const lerpEye = (a: Pose['eyes'][number], b: Pose['eyes'][number], t: number) => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t)
})

/** Interpolation de deux poses. Le decor se croise en opacite, pas en geometrie. */
function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t
  return {
    sil: blend(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t)
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t }))
    ],
    // la pastille appartient a un seul des deux etats, elle ne se melange pas
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind
  }
}

/**
 * Moteur sans horloge : `sample(t)` est une fonction pure du temps.
 *
 * Consequence pratique : pause, reprise, ralenti et saut a une date arbitraire
 * donnent exactement la meme image, et le rendu est testable sans DOM.
 */
export class BotEngine {
  /** rayon de la boule au repos, en unites de viewBox */
  readonly scale: number

  private cur: StateId
  private prev: StateId | null = null
  private tCur = 0
  private tPrev = 0
  private blinkAt = -10
  private pts: Point[] = []
  private shape: number[] | null = null
  private shapePrev: number[] | null = null
  private shapeAt = -10
  private expr: BotExpression | null = null
  private exprPrev: BotExpression | null = null
  private exprAt = -10

  /** duree du morph quand on change la forme du corps */
  static readonly SHAPE_MORPH = 0.45

  constructor(
    scale = 100,
    initial: StateId = 'idle',
    shape: number[] | null = null,
    expression: BotExpression | null = null
  ) {
    this.scale = scale
    this.cur = initial
    this.shape = shape
    this.expr = expression
  }

  /**
   * Expression de repos choisie dans le personnalisateur. Comme la forme, elle
   * glisse vers la nouvelle valeur au lieu de sauter.
   */
  setExpression(expression: BotExpression | null, now = 0) {
    if (expression === this.expr) return
    this.exprPrev = this.expr
    this.expr = expression
    this.exprAt = now
  }

  /** Expression effective a l'instant `now`, morph en cours compris. */
  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr
    const from = this.exprPrev
    if (!to || !from) return to
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Forme choisie dans le personnalisateur. Elle ne remplace le corps que sur
   * les etats au repos (`baseBody`) : sur les autres, la silhouette EST
   * l'animation et ne doit pas etre ecrasee.
   *
   * Le changement se fait en morph, pas d'un coup : comme toutes les formes sont
   * echantillonnees aux memes angles, il suffit d'interpoler les rayons.
   */
  setShape(radii: number[] | null, now = 0) {
    if (radii === this.shape) return
    this.shapePrev = this.shape
    this.shape = radii
    this.shapeAt = now
  }

  /**
   * Forme effective a l'instant `now`, morph en cours compris.
   *
   * Ne remet PAS `shapePrev` a null en fin de morph : `sample` doit rester une
   * fonction pure du temps, donc relire une date passee doit redonner l'image
   * intermediaire. On garde juste une reference de plus.
   */
  private shapeAtTime(now: number): number[] | null {
    const to = this.shape
    const from = this.shapePrev
    if (!to || !from) return to
    const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    const t = easings.easeOutQuint(clamp(k))
    // alloue seulement pendant le morph ; hors morph on rend le tableau tel quel
    return to.map((r, i) => lerp(from[i] ?? r, r, t))
  }

  private posed(
    def: StateDef,
    t: number,
    shape: number[] | null,
    expr: BotExpression | null
  ): Pose {
    let pose = def.pose(t)
    if (def.baseBody && shape) {
      // on garde la pose (rotation, decalage, squash) et on n'echange que le profil
      pose = { ...pose, sil: { ...pose.sil, radii: shape } }
    }
    if (def.baseFace && expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes }
    }
    return pose
  }

  get state(): StateId {
    return this.cur
  }

  setState(id: StateId, now: number) {
    if (id === this.cur) return
    this.prev = this.cur
    this.tPrev = this.tCur
    this.cur = id
    this.tCur = now
    // Dans la video, chaque changement de forme est masque par un clignement.
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now
  }

  sample(now: number): BotFrame {
    const R = this.scale
    const def = STATE_BY_ID.get(this.cur)!
    const shape = this.shapeAtTime(now)
    const expr = this.exprAtTime(now)
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr)

    // --- transition -------------------------------------------------------
    const since = now - this.tCur
    if (this.prev && since < def.morph) {
      const prevDef = STATE_BY_ID.get(this.prev)!
      const prevPose = this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr)
      // Ease-out exponentiel : c'est la courbe mesuree sur la video. Le corps
      // n'a pas d'overshoot (seuls la pastille et l'ouverture des yeux en ont).
      pose = blendPose(prevPose, pose, easings.easeOutQuint(since / def.morph))
    } else if (this.prev) {
      this.prev = null
    }

    // --- vie au repos -----------------------------------------------------
    const alive = pose.eyeAlpha > 0.01
    const life = liveliness(now, { wander: alive ? 1 : 0, blink: alive })

    const gaze = {
      yaw: pose.gaze.yaw + life.dYaw,
      pitch: pose.gaze.pitch + life.dPitch,
      roll: pose.gaze.roll + life.dRoll
    }

    // clignement declenche par le changement d'etat, en plus du calendrier
    const forced = clamp((now - this.blinkAt) / 0.2)
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1
    const lid = Math.min(life.lid, forcedLid)

    const offX = pose.offX + life.driftX
    const offY = pose.offY + life.driftY

    // --- corps ------------------------------------------------------------
    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath
    }
    const bodyPath = closedPath(toPoints(sil, R, this.pts))

    // --- yeux -------------------------------------------------------------
    // Les yeux vivent sur une sphere de rayon 1 ; des que la silhouette n'est
    // plus un cercle, on les ramene au prorata du rayon reel dans leur
    // direction, sinon ils debordent et le masque les coupe.
    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot)

    const eyes: RenderedEye[] = []
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]!
        if (e.depth <= 0.02) continue
        const cfg = pose.eyes[i]!
        const fit = bodyRadius(e.x, e.y)
        // Inclinaison propre de l'oeil : on compose le repere tangent avec une
        // rotation dans le plan de l'oeil (Basis x Rot). C'est ce qui permet des
        // inclinaisons en miroir entre les deux yeux.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
        const cp = Math.cos(phi)
        const sp = Math.sin(phi)
        const ax = e.a * cp + e.c * sp
        const ay = e.b * cp + e.d * sp
        const cx2 = -e.a * sp + e.c * cp
        const cy2 = -e.b * sp + e.d * cp
        // Le clignement s'applique APRES tout ca : c'est un ecrasement vertical
        // a l'ecran, pas le long de l'axe de la gelule.
        const k = blinkScale(Math.min(lid, cfg.open))
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + offX * R)},${r2(e.y * fit + offY * R)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12)
        })
      }
    }

    // --- decor ------------------------------------------------------------
    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }))

    // la pastille est posee sur le contour : elle suit donc la forme aussi
    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      // Les etats declarent des arcs en unites de rayon de boule ; le moteur
      // est le seul a connaitre l'echelle du viewBox, donc c'est lui qui trace.
      arcs: pose.arcs
        .filter((a) => a.opacity > 0.01)
        .map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch
    }
  }
}

export { STATES }
