<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BotTile from '@/components/BotTile.vue'
import Customizer from '@/components/Customizer.vue'
import GrokBot from '@/components/GrokBot.vue'
import Settings from '@/components/Settings.vue'
import SideRail, { type ViewId } from '@/components/SideRail.vue'
import Timeline from '@/components/Timeline.vue'
import { t } from '@/i18n'
import { blockAt, blocksWith, defaultCycle, makeBlock, parseCycles, type Cycle } from '@/bot/cycles'
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
 * Le montage releve sur la video n'est qu'une amorce : au premier lancement il
 * remplit la liste, ensuite les montages de l'utilisateur font foi — y compris
 * ses modifications de celui-la.
 */
const restored = parseCycles(localStorage.getItem('grokbot:cycles'))
const cycles = ref<Cycle[]>(restored.length ? restored : [defaultCycle()])

/**
 * Ou trouver un etat pour les liens `#etat=` : dans le montage courant s'il y
 * est, sinon dans un autre. Aucun montage n'est fige, donc l'etat demande peut
 * tres bien avoir ete retire partout — auquel cas le lien ne s'applique pas.
 */
function locate(id: StateId) {
  const ordre = [cycle.value, ...cycles.value.filter((c) => c.id !== activeId.value)]
  for (const c of ordre) {
    const index = c.blocks.findIndex((b) => b.state === id)
    if (index >= 0) return { id: c.id, index }
  }
  return null
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
  stored('grokbot:cycle', cycles.value[0]!.id, (v) => cycles.value.some((c) => c.id === v))
)
const block = ref(0)
const elapsed = ref(0)

const cycle = computed(() => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!)

// un lien vers un etat precis ouvre le montage qui le contient
if (initial.named) {
  const found = locate(initial.state)
  if (found) {
    activeId.value = found.id
    block.value = found.index
  }
}

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
    localStorage.setItem('grokbot:cycles', JSON.stringify(list))
  }, 250)
})
watch(activeId, (v) => localStorage.setItem('grokbot:cycle', v))

/* -------------------------------------------------------------------- vues */

// La personnalisation est la vue d'accueil, sauf si l'URL designe un etat
// precis : dans ce cas le lien vise clairement le lecteur.
const view = ref<ViewId>(initial.named ? 'animations' : 'personnaliser')

/**
 * Apercu : la scene seule, sans barre laterale, sans panneau ni montage. On en
 * sort par Echap ou par le bouton, qui reste le seul element affiche.
 */
const preview = ref(false)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') preview.value = false
})

/** On regarde une animation : elle se lance, sinon il n'y a rien a voir. */
function enterPreview() {
  preview.value = true
  playing.value = true
}
// Meme regle qu'au changement de vue : on ne joue pas la sequence en
// personnalisation, sinon la forme est illisible. Le watcher ne se declenchant
// qu'au changement, il faut l'appliquer aussi a l'initialisation.
const playing = ref(initial.playing && view.value === 'animations')

// L'URL est partageable, donc elle suit l'etat ET la lecture. replace et pas
// push : on ne veut pas un cran d'historique par etat.
watch([state, playing], ([id, on]) => {
  // L'URL decrit le LECTEUR. Hors de lui, l'etat affiche n'est qu'un decor de
  // vue — l'orbite par laquelle s'ouvrent les reglages — et n'a rien a faire
  // dans un lien partageable. L'y ecrire declenchait en plus un `hashchange`
  // qui replacait la tete de lecture sur les index du montage de l'utilisateur,
  // alors que la vue joue le sien : le lecteur restait coince sur l'orbite.
  if (view.value !== 'animations') return
  location.replace(`#etat=${id}${on ? '' : '&stop'}`)
})

window.addEventListener('hashchange', () => {
  const next = readHash()
  gallery.value = next.gallery
  if (next.gallery) return
  // Seul un lien qui NOMME un etat deplace la lecture. Sans ce garde, revenir
  // de la planche (`#planche` puis `#`) ramenerait au debut du montage.
  if (!next.named) return
  const found = locate(next.state)
  if (!found) return
  // un lien qui NOMME un etat vise le lecteur : on y va, meme depuis une autre vue
  view.value = 'animations'
  activeId.value = found.id
  block.value = found.index
})

/**
 * Hors du lecteur on ne regarde pas la sequence : on retombe sur l'etat de repos
 * et on suspend l'enchainement. L'horloge, elle, continue de tourner — le regard
 * derive et les yeux clignent toujours, ce qui garde le bot vivant sans empecher
 * de juger la forme, et c'est aussi ce qui laisse le regard suivre le curseur
 * dans les reglages.
 */
let resume = initial.playing
let resumeBlock = block.value

/**
 * Hors du lecteur, le montage joue est un unique bloc au repos : le cycle de
 * l'utilisateur peut tres bien ne contenir aucun etat au repos, et c'est le seul
 * ou la forme choisie se voit (`baseBody`).
 */
const REST = [makeBlock('idle')]

/**
 * Entree dans les reglages : le tourbillon, puis le repos.
 *
 * `swirl` porte le visage de repos, donc le suivi du curseur s'applique des la
 * premiere image et les yeux tournent d'un tour complet pour venir se poser a
 * gauche (voir `src/ui/gaze.ts`). Le bloc de repos qui suit reprend exactement la
 * meme pose : la reprise ne se voit pas.
 */
const ENTREE = [makeBlock('swirl'), makeBlock('idle')]

const played = computed(() => {
  if (view.value === 'animations') return cycle.value.blocks
  return view.value === 'reglages' ? ENTREE : REST
})

watch(view, (now, before) => {
  // On ne memorise la position qu'en QUITTANT le lecteur : passer de la
  // personnalisation aux reglages ne doit pas ecraser la position gardee par le
  // zero qu'on vient d'y poser.
  if (before === 'animations') {
    resume = playing.value
    resumeBlock = block.value
  }
  if (now === 'animations') {
    playing.value = resume
    block.value = resumeBlock
    return
  }
  block.value = 0
  // seuls les reglages jouent quelque chose hors du lecteur : leur orbite d'entree
  playing.value = now === 'reglages'
})

/**
 * L'orbite d'entree ne se joue qu'une fois : des que le lecteur atteint le bloc
 * de repos, on coupe l'enchainement. Sans ca le montage bouclerait et la vue
 * rejouerait son entree indefiniment.
 */
watch(block, (i) => {
  if (view.value === 'reglages' && i > 0) playing.value = false
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

/* ----------------------------------------------------------------- humeurs */

/**
 * Dans les reglages, le bot change d'humeur de temps a autre pendant que ses
 * yeux suivent le curseur. C'est un vernis de page, PAS un reglage :
 * l'expression choisie par l'utilisateur n'est ni remplacee ni ecrite dans le
 * stockage, on se contente d'en jouer une autre le temps de la visite.
 *
 * Les humeurs retenues ont toutes un lacet propre modeste : le demi-tour de tete
 * de la vue se calcule par rapport a lui (voir `GrokBot.vue`), et une expression
 * qui regarde deja loin de cote laisserait moins de marge au suivi.
 */
const HUMEURS = ['curieux', 'confus', 'surpris', 'attentif', 'heureux', 'mefiant']

/**
 * Dans les reglages la boule redevient RONDE, quelle que soit la forme choisie.
 * L'orbite d'entree se relache sur une sphere — c'est ce que la video montre — et
 * une goutte ou un hexagone en sortie de morph ne se lisent pas comme une boule
 * qui tourne. Le choix de l'utilisateur n'est pas touche, seulement ce qu'on
 * affiche ici : il revient intact des qu'on quitte la vue.
 */
const forme = computed(() => (view.value === 'reglages' ? DEFAULT_SHAPE : shape.value))

/** Duree d'une humeur. Assez longue pour qu'on la remarque sans qu'elle agite. */
const HUMEUR_MS = 4200

const humeur = ref<string | null>(null)
let humeurTimer: ReturnType<typeof setInterval> | undefined

watch(view, (v) => {
  clearInterval(humeurTimer)
  if (v !== 'reglages') {
    // retour a l'expression de l'utilisateur, en morphant comme le reste
    humeur.value = null
    return
  }
  // on part de SON expression et on derive ensuite : le changement se remarque
  let i = 0
  humeurTimer = setInterval(() => {
    humeur.value = HUMEURS[i % HUMEURS.length]!
    i++
  }, HUMEUR_MS)
})

const order = computed(() => SEQUENCE.map((id) => STATES.find((s) => s.id === id)!))

/** Ajoute une animation a la fin du montage courant. */
function addBlock(id: StateId) {
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
  const { index, elapsed: offset } = blockAt(cycle.value.blocks, t)
  bot.value?.seek(index, offset)
}

</script>

<template>
  <div v-if="gallery" class="p-5">
    <a class="text-xs text-[var(--muted)] underline underline-offset-2" href="#">
      {{ t('gallery.back') }}
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
        <figcaption class="text-xs text-[var(--muted)]">{{ t(`states.${s.id}`) }}</figcaption>
      </figure>
    </div>
  </div>

  <template v-else>
    <!-- titre de structure : la page n'affiche volontairement aucun titre, mais
         un document sans h1 n'est pas navigable au lecteur d'ecran -->
    <h1 class="sr-only">{{ t('app.name') }}</h1>
    <SideRail v-if="!preview" v-model="view" />

    <!-- Sortie d'apercu : le seul element qui reste a l'ecran avec l'avatar. -->
    <button
      v-else
      type="button"
      class="fixed top-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)]"
      @click="preview = false"
    >
      {{ t('preview.exit') }}
      <kbd class="rounded bg-black/5 px-1 py-0.5 text-[10px]">{{ t('preview.key') }}</kbd>
    </button>

    <!-- La place de la barre de montage est reservee dans les deux vues : elle
         est fixee en bas, donc sans cette reserve la scene se recentrerait en
         passant a la personnalisation et l'avatar sauterait d'un cran. -->
    <div
      class="scene min-h-full items-stretch justify-center p-8 max-lg:flex max-lg:flex-col max-lg:gap-10"
      :class="[
        preview ? '' : 'pb-[calc(var(--timeline)_+_1rem)] pl-24',
        view === 'reglages' && 'scene--gauche'
      ]"
    >
      <!--
        Panneau des reglages, colonne de GAUCHE : c'est l'ouverture de cette
        colonne qui pousse l'avatar vers la droite. Il reste monte quand la vue
        change, sinon il n'y aurait rien a faire glisser — c'est la largeur de sa
        colonne qui l'escamote, pas un `v-if`.
      -->
      <!-- Centre verticalement, contrairement au panneau de droite : celui-la est
           une longue grille de vignettes qui part du haut, celui-ci tient en
           quelques lignes et se lirait comme oublie en haut d'un grand vide. Puis
           remonte d'un cran : centre au pixel, il tombe plus bas que le regard,
           qui se porte au tiers superieur. -->
      <aside
        v-if="!preview"
        class="panneau scene__gauche w-full lg:w-80 lg:shrink-0 lg:self-center lg:-translate-y-12"
        :class="view === 'reglages' ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
      >
        <Settings />
      </aside>

      <!-- scene. Sa hauteur ne doit pas dependre du panneau de droite : etiree
           (items-stretch), elle suivait le panneau de personnalisation, plus
           haut que la grille d'animations, et l'avatar centre changeait de
           place d'un onglet a l'autre. -->
      <main
        class="scene__avatar flex flex-1 items-center justify-center max-lg:order-1 lg:self-start"
        :class="
          preview
            ? 'lg:min-h-[calc(100dvh_-_4rem)]'
            : 'lg:min-h-[calc(100dvh_-_3rem_-_var(--timeline))]'
        "
      >
        <!-- l'avatar se met a la hauteur disponible : sur une fenetre basse, la
             barre de montage lui prend assez de place pour qu'un carre de 460
             deborde et fasse defiler la page -->
        <div
          class="avatar flex aspect-square w-full items-center justify-center"
          :class="[
            preview
              ? 'max-w-[min(560px,calc(100dvh_-_6rem))]'
              : 'max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))]',
            view === 'reglages' && !preview && 'avatar--geant'
          ]"
        >
          <GrokBot
            ref="bot"
            class="h-auto max-w-full"
            v-model:state="state"
            v-model:block="block"
            v-model:elapsed="elapsed"
            v-model:playing="playing"
            :cycle="played"
            :size="preview ? 560 : 440"
            :shape="forme"
            :color="color"
            :expression="humeur ?? expression"
            :follow="view === 'reglages'"
          />
        </div>
      </main>

      <!-- largeur fixe, identique dans les deux vues : sinon la scene se decale
           au changement d'onglet. w-80 est la contrainte du personnalisateur
           (grille de 4 vignettes), le panneau d'animations s'y adapte. -->
      <aside
        v-if="!preview"
        class="panneau scene__droite w-full lg:w-80 lg:shrink-0"
        :class="view === 'reglages' ? 'max-lg:hidden' : 'panneau--ouvert max-lg:order-2'"
      >
        <!-- palette : une vignette s'ajoute a la fin du montage -->
        <template v-if="view === 'animations'">
          <h2 class="text-sm font-semibold">{{ t('panel.animations') }}</h2>
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <BotTile
              v-for="s in order"
              :key="s.id"
              :label="t(`states.${s.id}`)"
              :selected="s.id === state"
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
      v-if="view === 'animations' && !preview"
      v-model:cycles="cycles"
      v-model:active-id="activeId"
      v-model:block="block"
      v-model:playing="playing"
      :elapsed="elapsed"
      :shape="shape"
      :color="color"
      :expression="expression"
      @seek="onSeek"
      @preview="enterPreview"
    />
  </template>
</template>
