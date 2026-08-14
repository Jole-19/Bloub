<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, triggerRef, watch } from 'vue'
import { NOTIF_BLUE } from '@/bot/decor'
import { BotEngine, type BotFrame } from '@/bot/engine'
import {
  DEFAULT_EXPRESSION,
  EXPRESSION_BY_ID
} from '@/bot/expressions'
import {
  COLOR_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  SHAPE_BY_ID,
  mixHex
} from '@/bot/skins'
import { defaultCycle, type Block } from '@/bot/cycles'
import { type StateId } from '@/bot/states'

const props = withDefaults(
  defineProps<{
    size?: number
    /** identifiant de forme du personnalisateur */
    shape?: string
    /** identifiant de couleur du personnalisateur */
    color?: string
    /** identifiant d'expression de repos du personnalisateur */
    expression?: string
    /** couleur du fond, utilisee pour la brume de profondeur des particules */
    paper?: string
    /**
     * Fige le rendu a cette date (en secondes depuis le debut de l'etat).
     * Le moteur etant une fonction pure du temps, on obtient une image
     * reproductible au pixel pres, sans boucle d'animation : utile pour une
     * planche d'etats, une vignette de personnalisateur ou un test.
     */
    frozenAt?: number
    /**
     * Montage joue par le lecteur : une suite d'etats, chacun tenu la duree de
     * son bloc. Par defaut, le cycle releve sur la video.
     */
    cycle?: Block[]
  }>(),
  {
    size: 320,
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    expression: DEFAULT_EXPRESSION,
    paper: '#f9f9f9',
    frozenAt: undefined,
    cycle: () => defaultCycle().blocks
  }
)

/**
 * Le curseur de lecture est un **index de bloc**, pas un etat : un montage peut
 * jouer deux fois le meme etat, et il faut alors savoir dans lequel des deux on
 * se trouve. `state` suit le bloc courant — c'est une sortie, l'exterieur pilote
 * la lecture par `block`.
 */
const block = defineModel<number>('block', { default: 0 })
const state = defineModel<StateId>('state', { default: 'idle' })
const playing = defineModel<boolean>('playing', { default: false })
/** Temps ecoule dans le bloc courant, pour la tete de lecture de la timeline. */
const elapsed = defineModel<number>('elapsed', { default: 0 })

/** Rayon de la boule au repos en unites de viewBox ; la marge loge les anneaux. */
const R = 100
const VB = 158

const shapeRadii = computed(() => SHAPE_BY_ID.get(props.shape)?.radii ?? null)
const ink = computed(() => COLOR_BY_ID.get(props.color)?.hex ?? '#0a0a0c')
const expression = computed(() => EXPRESSION_BY_ID.get(props.expression) ?? null)

const engine = new BotEngine(R, state.value, shapeRadii.value, expression.value)
const frame = shallowRef<BotFrame>(engine.sample(props.frozenAt ?? 0))
const uid = Math.random().toString(36).slice(2, 8)
const maskId = `bot-mask-${uid}`

let raf = 0
let nextAt = Infinity
let last = 0
let clock = 0
/** Date d'horloge a laquelle le bloc courant a commence. */
let blockStart = 0

/**
 * Pose le bloc `i` : etat, moteur, et date de fin. Appele aussi bien par la
 * boucle que par le watcher, d'ou l'absence d'effet de bord sur `block` — c'est
 * l'appelant qui decide s'il deplace le curseur.
 */
function apply(i: number, from = 0) {
  const b = props.cycle[i]
  if (!b) {
    nextAt = Infinity
    return
  }
  blockStart = clock - from
  elapsed.value = from
  state.value = b.state
  engine.setState(b.state, clock)
  nextAt = playing.value ? blockStart + b.duration : Infinity
}

/** Deplace le curseur et recale le moteur dans la foulee, sans passer par le watcher. */
function goToBlock(i: number) {
  block.value = i
  apply(i)
}

/**
 * Deplacement de la tete de lecture depuis la timeline : on tombe au milieu d'un
 * bloc, pas a son debut. L'offset transite par une variable plutot que par un
 * appel direct a `apply` : changer `block` declenchera le watcher, qui doit
 * poser la meme date que nous — sinon il remettrait le bloc a zero juste apres.
 */
let pendingOffset = 0

function seek(index: number, offset = 0) {
  if (block.value === index) {
    apply(index, offset)
    return
  }
  pendingOffset = offset
  block.value = index
}

defineExpose({ seek })

function tick(ms: number) {
  raf = requestAnimationFrame(tick)
  // Horloge de scene a delta borne : un onglet masque puis reaffiche reprend
  // sans sauter en avant (rAF est suspendu pendant ce temps-la).
  const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
  last = ms
  clock += dt

  // Le stop ne gele pas l'horloge : arrete, le bot continue de respirer et de
  // cligner. Seuls l'enchainement du montage et la tete de lecture sont
  // suspendus.
  if (playing.value) {
    if (clock >= nextAt && props.cycle.length) {
      goToBlock((block.value + 1) % props.cycle.length)
    } else {
      elapsed.value = clock - blockStart
    }
  }

  frame.value = engine.sample(clock)
  triggerRef(frame)
}

/** Redessine sans la boucle : sert aux vignettes figees quand la forme change. */
function redrawFrozen() {
  if (props.frozenAt === undefined) return
  frame.value = engine.sample(props.frozenAt)
  triggerRef(frame)
}

// Curseur deplace de l'exterieur : clic sur un bloc de la timeline. Quand c'est
// `goToBlock` qui l'a bouge, `apply` est deja passe et repasse ici sans effet
// (setState sort si l'etat n'a pas change, la date de fin est la meme).
watch(block, (i) => {
  apply(i, pendingOffset)
  pendingOffset = 0
})

// Changement d'etat venu d'une prop : c'est le cas des vignettes figees, qui
// n'ont pas de curseur. En lecture, `apply` a deja fait le travail.
watch(state, (id) => {
  engine.setState(id, clock)
  redrawFrozen()
})

// Reprise la ou la tete de lecture s'est arretee, pas au debut du bloc.
watch(playing, (on) => {
  if (on) apply(block.value, elapsed.value)
  else nextAt = Infinity
})

// Le montage a change sous nos pieds : bloc supprime, duree tiree, autre cycle
// choisi. On garde le curseur dans les bornes et on recale la date de fin sur
// la nouvelle duree — si le bloc a ete raccourci sous la position courante, la
// boucle passe au suivant des la frame suivante, ce qui est le comportement
// voulu.
watch(
  () => props.cycle,
  (blocks) => {
    if (!blocks.length) {
      nextAt = Infinity
      return
    }
    const i = Math.min(block.value, blocks.length - 1)
    if (i !== block.value) {
      goToBlock(i)
      return
    }
    nextAt = playing.value ? blockStart + blocks[i]!.duration : Infinity
  }
)

watch(shapeRadii, (radii) => {
  // on passe l'horloge : le moteur morphe vers la nouvelle forme au lieu de
  // l'appliquer d'un coup
  engine.setShape(radii, clock)
  redrawFrozen()
})

watch(expression, (expr) => {
  engine.setExpression(expr, clock)
  redrawFrozen()
})

onMounted(() => {
  if (props.frozenAt !== undefined) return
  // le curseur peut arriver deja pose (URL, cycle relu du stockage)
  apply(block.value, elapsed.value)
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

/**
 * Un point est un simple disque, sauf quand l'etat fournit une forme (la
 * goutte du "!" penche) : le path est alors en unites de rayon de boule et
 * centre sur l'origine, donc on le pose avec translate/rotate/scale.
 *
 * La couleur suit celle du corps par defaut ; `depth` sert aux particules, qui
 * se fondent dans le fond a mesure qu'elles s'eloignent.
 */
function dotAttrs(dot: BotFrame['dots'][number]) {
  const fill =
    dot.color ?? (dot.depth === undefined ? ink.value : mixHex(props.paper, ink.value, dot.depth))
  const common = { fill, opacity: dot.opacity }
  return dot.d
    ? {
        ...common,
        d: dot.d,
        transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`
      }
    : { ...common, cx: dot.x, cy: dot.y, r: dot.r }
}
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    :viewBox="`${-VB} ${-VB} ${VB * 2} ${VB * 2}`"
    role="img"
    aria-label="Avatar Grok anime"
  >
    <defs>
      <!--
        Les yeux sont de vrais trous perces dans le corps (comme sur x.ai), pas
        des formes blanches posees dessus : ils restent donc automatiquement
        rognes par la silhouette quand ils glissent vers le bord.
      -->
      <mask
        :id="maskId"
        maskUnits="userSpaceOnUse"
        :x="-VB"
        :y="-VB"
        :width="VB * 2"
        :height="VB * 2"
      >
        <path :d="frame.bodyPath" fill="#fff" />
        <path
          v-for="(eye, i) in frame.eyes"
          :key="i"
          :d="eye.d"
          :transform="eye.matrix"
          :opacity="eye.alpha"
          fill="#000"
        />
        <circle
          v-if="frame.notch"
          :cx="frame.notch.x"
          :cy="frame.notch.y"
          :r="frame.notch.r"
          fill="#000"
        />
      </mask>

      <linearGradient
        v-for="arc in frame.arcs"
        :id="`${uid}-${arc.id}`"
        :key="arc.id"
        gradientUnits="userSpaceOnUse"
        :x1="arc.grad.x1"
        :y1="arc.grad.y1"
        :x2="arc.grad.x2"
        :y2="arc.grad.y2"
      >
        <stop
          v-for="(c, i) in arc.grad.stops"
          :key="i"
          :offset="i / (arc.grad.stops.length - 1)"
          :stop-color="c"
        />
      </linearGradient>
    </defs>

    <!-- moitie arriere des orbites : dessinee avant le corps, donc occultee -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`b${arc.id}`"
        :d="arc.back"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>

    <!-- particules de l'eclatement : elles passent derriere le noyau -->
    <g v-if="frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pb${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <g :mask="`url(#${maskId})`" :opacity="frame.bodyAlpha">
      <rect :x="-VB" :y="-VB" :width="VB * 2" :height="VB * 2" :fill="ink" />
    </g>

    <g v-if="!frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pf${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <circle
      v-if="frame.notif"
      :cx="frame.notif.x"
      :cy="frame.notif.y"
      :r="frame.notif.r"
      :fill="NOTIF_BLUE"
    />

    <!-- moitie avant des orbites -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`f${arc.id}`"
        :d="arc.front"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>
  </svg>
</template>
