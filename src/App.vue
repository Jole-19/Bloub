<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BotTile from '@/components/BotTile.vue'
import Customizer from '@/components/Customizer.vue'
import GrokBot from '@/components/GrokBot.vue'
import SideRail, { type ViewId } from '@/components/SideRail.vue'
import Timeline from '@/components/Timeline.vue'
import {
  blockAt,
  blocksWith,
  DEFAULT_CYCLE_ID,
  defaultCycle,
  makeBlock,
  parseCycles,
  type Cycle
} from '@/bot/cycles'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '@/bot/expressions'
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPE_BY_ID } from '@/bot/skins'
import { POSES, SEQUENCE, STATES, type StateId } from '@/bot/states'

/**
 * L'URL pilote la vue : `#etat=orbit&stop` ouvre un etat precis sequence a
 * l'arret, `#planche` affiche la planche. On relit a chaque `hashchange` pour
 * que les boutons precedent/suivant du navigateur fonctionnent vraiment.
 */
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1))
  const asked = params.get('etat') as StateId | null
  // on ne fait jamais confiance a l'URL : l'etat doit exister
  const known = STATES.some((s) => s.id === asked)
  return {
    state: known ? asked! : 'idle',
    named: known,
    playing: !params.has('stop'),
    gallery: params.has('planche')
  }
}

const initial = readHash()
const gallery = ref(initial.gallery)

/* ------------------------------------------------------------------ cycles */

/**
 * Le cycle releve sur la video est reconstruit a chaque chargement, jamais
 * stocke : c'est la reference, elle doit suivre le code et pas le navigateur.
 * Seuls les montages de l'utilisateur sont persistes.
 */
const REFERENCE = defaultCycle()
const cycles = ref<Cycle[]>([REFERENCE, ...parseCycles(localStorage.getItem('grokbot:cycles'))])

/** Emplacement d'un etat dans le cycle de reference, pour les liens `#etat=`. */
function refBlockOf(id: StateId) {
  return Math.max(0, REFERENCE.blocks.findIndex((b) => b.state === id))
}

/**
 * Forme, couleur, expression et cycle survivent au rechargement : c'est l'avatar
 * de l'utilisateur, pas un reglage de session. On valide au chargement, un id
 * inconnu retombe sur le defaut.
 */
function stored(key: string, fallback: string, exists: (v: string) => boolean) {
  const v = localStorage.getItem(key)
  return v && exists(v) ? v : fallback
}

const activeId = ref(
  initial.named
    ? DEFAULT_CYCLE_ID
    : stored('grokbot:cycle', DEFAULT_CYCLE_ID, (v) => cycles.value.some((c) => c.id === v))
)
const block = ref(initial.named ? refBlockOf(initial.state) : 0)
const elapsed = ref(0)

const cycle = computed(() => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!)

// L'etat est une sortie du lecteur : c'est le bloc courant qui commande. On
// l'initialise sur ce bloc pour ne pas entrer en morphant depuis un etat qui
// n'a jamais ete affiche.
const state = ref<StateId>(cycle.value.blocks[block.value]?.state ?? 'idle')

/**
 * Ecriture differee : etirer une carte remplace le cycle a chaque mouvement de
 * souris, et `localStorage` est synchrone — l'ecrire soixante fois par seconde
 * pendant un glisser bloquerait le rendu pour rien.
 */
let pending: ReturnType<typeof setTimeout>
watch(cycles, (list) => {
  clearTimeout(pending)
  pending = setTimeout(() => {
    localStorage.setItem('grokbot:cycles', JSON.stringify(list.filter((c) => !c.locked)))
  }, 250)
})
watch(activeId, (v) => localStorage.setItem('grokbot:cycle', v))

/* -------------------------------------------------------------------- vues */

// La personnalisation est la vue d'accueil, sauf si l'URL designe un etat
// precis : dans ce cas le lien vise clairement le lecteur.
const view = ref<ViewId>(initial.named ? 'animations' : 'personnaliser')
// Meme regle qu'au changement de vue : on ne joue pas la sequence en
// personnalisation, sinon la forme est illisible. Le watcher ne se declenchant
// qu'au changement, il faut l'appliquer aussi a l'initialisation.
const playing = ref(initial.playing && view.value === 'animations')

// L'URL est partageable, donc elle suit l'etat ET la lecture. replace et pas
// push : on ne veut pas un cran d'historique par etat. Sur un montage
// personnel, en revanche, elle n'aurait aucun sens : on n'y touche pas.
watch([state, playing], ([id, on]) => {
  if (activeId.value !== DEFAULT_CYCLE_ID) return
  location.replace(`#etat=${id}${on ? '' : '&stop'}`)
})

window.addEventListener('hashchange', () => {
  const next = readHash()
  gallery.value = next.gallery
  if (next.gallery) return
  // Seul un lien qui NOMME un etat parle du cycle de reference — le seul qui
  // les contient tous les quatorze. Sans ca, revenir de la planche (`#planche`
  // puis `#`) jetterait le montage en cours de l'utilisateur.
  if (!next.named) return
  activeId.value = DEFAULT_CYCLE_ID
  block.value = refBlockOf(next.state)
})

/**
 * En personnalisation on regarde la forme, pas la sequence : on retombe sur
 * l'etat de repos et on suspend l'enchainement. L'horloge, elle, continue de
 * tourner — le regard derive et les yeux clignent toujours, ce qui garde le bot
 * vivant sans empecher de juger la forme.
 */
let resume = initial.playing
let resumeBlock = block.value

/**
 * En personnalisation le lecteur joue un montage d'un seul bloc au repos : le
 * cycle de l'utilisateur peut tres bien ne contenir aucun etat au repos, et la
 * forme choisie ne se voit que la (`baseBody`).
 */
const REST = [makeBlock('idle')]
const played = computed(() => (view.value === 'personnaliser' ? REST : cycle.value.blocks))

watch(view, (now, before) => {
  if (now === 'personnaliser') {
    resume = playing.value
    resumeBlock = block.value
    playing.value = false
    block.value = 0
  } else if (before === 'personnaliser') {
    playing.value = resume
    block.value = resumeBlock
  }
})

/* ------------------------------------------------------------------- skins */

const shape = ref(stored('grokbot:forme', DEFAULT_SHAPE, (v) => SHAPE_BY_ID.has(v)))
const color = ref(stored('grokbot:couleur', DEFAULT_COLOR, (v) => COLOR_BY_ID.has(v)))
const expression = ref(
  stored('grokbot:expression', DEFAULT_EXPRESSION, (v) => EXPRESSION_BY_ID.has(v))
)

watch(shape, (v) => localStorage.setItem('grokbot:forme', v))
watch(color, (v) => localStorage.setItem('grokbot:couleur', v))
watch(expression, (v) => localStorage.setItem('grokbot:expression', v))

const order = computed(() => SEQUENCE.map((id) => STATES.find((s) => s.id === id)!))

/** Ajoute une animation a la fin du montage courant. */
function addBlock(id: StateId) {
  if (cycle.value.locked) return
  cycles.value = cycles.value.map((c) =>
    c.id === cycle.value.id ? { ...c, blocks: blocksWith(c.blocks, id) } : c
  )
}

/**
 * Deplacement de la tete de lecture depuis la regle. Le lecteur est le seul a
 * pouvoir recaler le moteur (il tient l'horloge), d'ou l'appel direct.
 */
const bot = ref<InstanceType<typeof GrokBot> | null>(null)

function onSeek(t: number) {
  const { index, elapsed: offset } = blockAt(cycle.value, t)
  bot.value?.seek(index, offset)
}

</script>

<template>
  <div v-if="gallery" class="p-5">
    <a class="text-xs text-[var(--muted)] underline underline-offset-2" href="#">
      Retour au lecteur
    </a>
    <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      <figure v-for="s in order" :key="s.id" class="flex flex-col items-center">
        <GrokBot
          :state="s.id"
          :size="210"
          :shape="shape"
          :color="color"
          :expression="expression"
          :frozen-at="POSES[s.id]"
        />
        <figcaption class="text-xs text-[var(--muted)]">{{ s.label }}</figcaption>
      </figure>
    </div>
  </div>

  <template v-else>
    <!-- titre de structure : la page n'affiche volontairement aucun titre, mais
         un document sans h1 n'est pas navigable au lecteur d'ecran -->
    <h1 class="sr-only">Grok bot</h1>
    <SideRail v-model="view" />

    <!-- La place de la barre de montage est reservee dans les deux vues : elle
         est fixee en bas, donc sans cette reserve la scene se recentrerait en
         passant a la personnalisation et l'avatar sauterait d'un cran. -->
    <div
      class="flex min-h-full items-stretch justify-center gap-10 p-8 pb-[calc(var(--timeline)_+_1rem)] pl-24 max-lg:flex-col"
    >
      <!-- scene. Sa hauteur ne doit pas dependre du panneau de droite : etiree
           (items-stretch), elle suivait le panneau de personnalisation, plus
           haut que la grille d'animations, et l'avatar centre changeait de
           place d'un onglet a l'autre. -->
      <main
        class="flex flex-1 items-center justify-center lg:min-h-[calc(100dvh_-_3rem_-_var(--timeline))] lg:self-start"
      >
        <!-- l'avatar se met a la hauteur disponible : sur une fenetre basse, la
             barre de montage lui prend assez de place pour qu'un carre de 460
             deborde et fasse defiler la page -->
        <div
          class="flex aspect-square w-full max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))] items-center justify-center"
        >
          <GrokBot
            ref="bot"
            class="h-auto max-w-full"
            v-model:state="state"
            v-model:block="block"
            v-model:elapsed="elapsed"
            v-model:playing="playing"
            :cycle="played"
            :size="440"
            :shape="shape"
            :color="color"
            :expression="expression"
          />
        </div>
      </main>

      <!-- largeur fixe, identique dans les deux vues : sinon la scene se decale
           au changement d'onglet. w-80 est la contrainte du personnalisateur
           (grille de 4 vignettes), le panneau d'animations s'y adapte. -->
      <aside class="w-full lg:w-80 lg:shrink-0">
        <!-- palette : une vignette s'ajoute a la fin du montage -->
        <template v-if="view === 'animations'">
          <h2 class="text-sm font-semibold">Animations</h2>
          <p class="mt-0.5 text-xs text-[var(--muted)]">
            {{
              cycle.locked ? 'Cycle verrouillé — crée le tien pour monter.' : 'Clique pour ajouter.'
            }}
          </p>
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <BotTile
              v-for="s in order"
              :key="s.id"
              :label="s.label"
              :selected="s.id === state"
              :disabled="cycle.locked"
              :state="s.id"
              :shape="shape"
              :color="color"
              :expression="expression"
              :frozen-at="POSES[s.id]"
              @click="addBlock(s.id)"
            />
          </div>
        </template>

        <!-- personnalisation -->
        <template v-else>
          <Customizer
            v-model:shape="shape"
            v-model:color="color"
            v-model:expression="expression"
          />
        </template>
      </aside>
    </div>

    <Timeline
      v-if="view === 'animations'"
      v-model:cycles="cycles"
      v-model:active-id="activeId"
      v-model:block="block"
      v-model:playing="playing"
      :elapsed="elapsed"
      :shape="shape"
      :color="color"
      :expression="expression"
      @seek="onSeek"
    />
  </template>
</template>
