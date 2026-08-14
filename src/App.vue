<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BotTile from '@/components/BotTile.vue'
import Customizer from '@/components/Customizer.vue'
import GrokBot from '@/components/GrokBot.vue'
import SideRail, { type ViewId } from '@/components/SideRail.vue'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '@/bot/expressions'
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPE_BY_ID } from '@/bot/skins'
import { SEQUENCE, STATES, type StateId } from '@/bot/states'

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

// La personnalisation est la vue d'accueil, sauf si l'URL designe un etat
// precis : dans ce cas le lien vise clairement le lecteur.
const view = ref<ViewId>(initial.named ? 'animations' : 'personnaliser')
const state = ref<StateId>(initial.state)
// Meme regle qu'au changement de vue : on ne joue pas la sequence en
// personnalisation, sinon la forme est illisible. Le watcher ne se declenchant
// qu'au changement, il faut l'appliquer aussi a l'initialisation.
const playing = ref(initial.playing && view.value === 'animations')

// L'URL est partageable, donc elle suit l'etat ET la lecture. replace et pas
// push : on ne veut pas un cran d'historique par etat.
watch([state, playing], ([id, on]) => {
  location.replace(`#etat=${id}${on ? '' : '&stop'}`)
})

window.addEventListener('hashchange', () => {
  const next = readHash()
  gallery.value = next.gallery
  if (!next.gallery) state.value = next.state
})

/**
 * En personnalisation on regarde la forme, pas la sequence : on retombe sur
 * l'etat de repos et on suspend l'enchainement. L'horloge, elle, continue de
 * tourner — le regard derive et les yeux clignent toujours, ce qui garde le bot
 * vivant sans empecher de juger la forme.
 */
let resume = initial.playing

watch(view, (now, before) => {
  if (now === 'personnaliser') {
    resume = playing.value
    playing.value = false
    state.value = 'idle'
  } else if (before === 'personnaliser') {
    playing.value = resume
  }
})

/**
 * Forme et couleur survivent au rechargement : c'est l'avatar de l'utilisateur,
 * pas un reglage de session. On valide au chargement, un id inconnu retombe sur
 * le defaut.
 */
function stored(key: string, fallback: string, exists: (v: string) => boolean) {
  const v = localStorage.getItem(key)
  return v && exists(v) ? v : fallback
}

const shape = ref(stored('grokbot:forme', DEFAULT_SHAPE, (v) => SHAPE_BY_ID.has(v)))
const color = ref(stored('grokbot:couleur', DEFAULT_COLOR, (v) => COLOR_BY_ID.has(v)))
const expression = ref(
  stored('grokbot:expression', DEFAULT_EXPRESSION, (v) => EXPRESSION_BY_ID.has(v))
)

watch(shape, (v) => localStorage.setItem('grokbot:forme', v))
watch(color, (v) => localStorage.setItem('grokbot:couleur', v))
watch(expression, (v) => localStorage.setItem('grokbot:expression', v))

const current = computed(() => STATES.find((s) => s.id === state.value))
const order = computed(() => SEQUENCE.map((id) => STATES.find((s) => s.id === id)!))

/**
 * Planche d'etats : chaque vignette est figee a une date choisie pour montrer
 * l'etat a son moment le plus lisible. Rendu deterministe, donc comparable
 * d'une execution a l'autre. Typer par StateId force a couvrir tout nouvel etat.
 */
const POSES: Record<StateId, number> = {
  idle: 1,
  thinking: 1.1,
  wink: 0.8,
  wide: 0.8,
  alert: 0.75,
  notify: 0.9,
  exclaim: 0.8,
  sleep: 0.45,
  egg: 0.8,
  hexagon: 0.8,
  play: 0.9,
  orbit: 1.2,
  burst: 0.45,
  comet: 1.15
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

    <div class="flex min-h-full items-stretch justify-center gap-10 p-8 pl-24 max-lg:flex-col">
      <!-- scene -->
      <main class="flex flex-1 flex-col items-center justify-center gap-8">
        <div class="flex aspect-square w-full max-w-[460px] items-center justify-center">
          <GrokBot
            v-model:state="state"
            v-model:playing="playing"
            :size="440"
            :shape="shape"
            :color="color"
            :expression="expression"
          />
        </div>

        <div v-if="view === 'animations'" class="flex flex-col items-center gap-3">
          <button
            type="button"
            class="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[var(--line)] bg-white transition hover:border-[var(--ink)] active:scale-95"
            :aria-label="playing ? 'Arreter la sequence' : 'Lancer la sequence'"
            @click="playing = !playing"
          >
            <svg v-if="!playing" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 13 8l-9 5.5z" fill="currentColor" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
              <rect x="9.3" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
            </svg>
          </button>
          <p class="text-center text-xs text-[var(--muted)]">
            <span class="font-medium text-[var(--ink)]">{{ current?.label }}</span>
            — {{ current?.hint }}
          </p>
        </div>
      </main>

      <!-- largeur fixe, identique dans les deux vues : sinon la scene se decale
           au changement d'onglet. w-80 est la contrainte du personnalisateur
           (grille de 4 vignettes), le panneau d'animations s'y adapte. -->
      <aside class="w-full lg:w-80 lg:shrink-0">
        <!-- panneau de declenchement manuel -->
        <template v-if="view === 'animations'">
          <h2 class="text-sm font-semibold">Animation</h2>
          <!--
            Vignettes figees a la pose la plus lisible de chaque etat (POSES),
            comme la planche : c'est la meme grille que le personnalisateur.
            Le descriptif de l'etat s'affiche sous la scene, il n'a pas a
            encombrer la liste ni a apparaitre en infobulle.
          -->
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <BotTile
              v-for="s in order"
              :key="s.id"
              :label="s.label"
              :selected="s.id === state"
              :state="s.id"
              :shape="shape"
              :color="color"
              :expression="expression"
              :frozen-at="POSES[s.id]"
              @click="state = s.id"
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
  </template>
</template>
