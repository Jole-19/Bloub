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
import { SEQUENCE, STATE_BY_ID, type StateId } from '@/bot/states'

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
  }>(),
  {
    size: 320,
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    expression: DEFAULT_EXPRESSION,
    paper: '#f9f9f9',
    frozenAt: undefined
  }
)

const state = defineModel<StateId>('state', { default: 'idle' })
const playing = defineModel<boolean>('playing', { default: false })

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

function schedule(id: StateId) {
  nextAt = clock + (STATE_BY_ID.get(id)?.duration ?? 2)
}

/** Change d'etat et recale le moteur dans la foulee, sans passer par le watcher. */
function goTo(id: StateId) {
  state.value = id
  engine.setState(id, clock)
  if (playing.value) schedule(id)
}

function tick(ms: number) {
  raf = requestAnimationFrame(tick)
  // Horloge de scene a delta borne : un onglet masque puis reaffiche reprend
  // sans sauter en avant (rAF est suspendu pendant ce temps-la).
  const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
  last = ms
  clock += dt

  // Le stop ne gele pas l'horloge : arrete, le bot continue de respirer et de
  // cligner. Seul l'enchainement de la sequence est suspendu.
  if (playing.value && clock >= nextAt) {
    const i = SEQUENCE.indexOf(state.value)
    goTo(SEQUENCE[(i + 1) % SEQUENCE.length]!)
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

// Changement venu de l'exterieur (clic sur un bouton, prop). setState et
// schedule sont idempotents, donc inoffensif quand goTo est deja passe.
watch(state, (id) => {
  engine.setState(id, clock)
  if (playing.value) schedule(id)
  redrawFrozen()
})

watch(playing, (on) => {
  if (on) schedule(state.value)
  else nextAt = Infinity
})

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
  if (playing.value) schedule(state.value)
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
