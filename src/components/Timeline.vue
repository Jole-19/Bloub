<script setup lang="ts">
import { computed, ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import CycleMenu from '@/components/CycleMenu.vue'
import NameDialog from '@/components/NameDialog.vue'
import TimelineTrack from '@/components/TimelineTrack.vue'
import ZoomSlider from '@/components/ZoomSlider.vue'
import {
  blocksWith,
  makeBlock,
  nextCycleId,
  offsetOf,
  totalDuration,
  uniqueName,
  type Block,
  type Cycle
} from '@/bot/cycles'
import type { StateId } from '@/bot/states'
import { MAX_ZOOM, MIN_ZOOM, mmss } from '@/ui/timeline'
import { nomDeCycle, pluriel, t } from '@/i18n'

/**
 * Barre de montage : elle tient les cycles (choix, creation, renommage,
 * suppression) et la lecture. La piste elle-meme est dans `TimelineTrack` —
 * ici on ne sait rien des gestes, la-bas on ne sait rien des cycles.
 */
const props = defineProps<{
  /** temps ecoule dans le bloc courant, pour le compteur */
  elapsed: number
  shape: string
  color: string
  expression: string
}>()

/**
 * `seek` : deplacement de la tete de lecture, seul le lecteur sait recaler le
 * moteur. `preview` : la page entiere se met en scene, c'est elle qui decide.
 */
const emit = defineEmits<{ seek: [seconds: number]; preview: [] }>()

const cycles = defineModel<Cycle[]>('cycles', { required: true })
const activeId = defineModel<string>('activeId', { required: true })
const block = defineModel<number>('block', { required: true })
const playing = defineModel<boolean>('playing', { required: true })

const zoom = ref(1)

const cycle = computed(() => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!)
const blocks = computed(() => cycle.value.blocks)
const total = computed(() => totalDuration(blocks.value))
const at = computed(() => offsetOf(blocks.value, block.value) + props.elapsed)

/**
 * Nommage d'un cycle : meme boite pour la creation et le renommage, le second
 * cas portant l'id vise. La creation n'a lieu qu'a la validation — annuler ne
 * doit pas laisser un cycle vide derriere.
 */
const naming = ref<{ mode: 'create' | 'rename'; id?: string } | null>(null)
const nameDraft = ref('')
const nameOpen = ref(false)

/** Montage en attente de confirmation de suppression. */
const removing = ref<Cycle | null>(null)
const confirmOpen = ref(false)
const removingDetail = computed(() =>
  pluriel('dialog.removeDetail', removing.value?.blocks.length ?? 0)
)

/** Remplace le cycle courant : les cycles sont des valeurs, jamais mutees. */
function edit(next: Partial<Cycle>) {
  cycles.value = cycles.value.map((c) => (c.id === cycle.value.id ? { ...c, ...next } : c))
}

function select(id: string) {
  activeId.value = id
  block.value = 0
}

function askCreate() {
  naming.value = { mode: 'create' }
  nameDraft.value = uniqueName(t('cycles.newName'), cycles.value)
  nameOpen.value = true
}

function askRename(id: string) {
  naming.value = { mode: 'rename', id }
  const vise = cycles.value.find((c) => c.id === id)
  // le montage d'amorce n'a pas de nom propre : on part de celui qui s'affiche,
  // sinon renommer commencerait sur un champ vide
  nameDraft.value = vise ? nomDeCycle(vise) : ''
  nameOpen.value = true
}

function onNamed(name: string) {
  const demande = naming.value
  naming.value = null
  if (!demande) return
  if (demande.mode === 'create') {
    // jamais de cycle vide : le lecteur aurait un montage sans rien a jouer
    const neuf: Cycle = {
      id: nextCycleId(cycles.value),
      name: uniqueName(name, cycles.value),
      blocks: [makeBlock('idle')]
    }
    cycles.value = [...cycles.value, neuf]
    select(neuf.id)
    return
  }
  const autres = cycles.value.filter((c) => c.id !== demande.id)
  const unique = uniqueName(name, autres)
  cycles.value = cycles.value.map((c) => (c.id === demande.id ? { ...c, name: unique } : c))
}

/** Suppression d'un montage : jamais sans confirmation, c'est irreversible. */
function askRemove(id: string) {
  removing.value = cycles.value.find((c) => c.id === id) ?? null
  confirmOpen.value = true
}

function onRemove() {
  const cible = removing.value
  removing.value = null
  if (!cible) return
  const reste = cycles.value.filter((c) => c.id !== cible.id)
  cycles.value = reste
  if (cible.id === activeId.value) select(reste[0]!.id)
}
</script>

<template>
  <!--
    Barre de montage : fixee en bas, sans fond ni cadre — elle doit se lire
    comme une partie de la page, au meme titre que le panneau de droite, dont
    elle s'arrete avant la colonne (largeur du panneau + gouttiere + marge).
    La scene lui reserve sa hauteur (`--timeline`) dans les DEUX vues, sinon
    l'avatar centre sauterait d'un onglet a l'autre.
  -->
  <div
    class="fixed inset-x-0 bottom-0 z-30 h-[var(--timeline)] px-6 pt-3 pb-5 lg:right-[24.5rem]"
  >
    <!-- lecture : flottante au-dessus de la piste, au centre, le temps ecoule a
         gauche et la duree totale a droite -->
    <div class="absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-3">
      <span class="text-sm font-medium tabular-nums">{{ mmss(at) }}</span>
      <button
        type="button"
        class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-sm transition hover:scale-105 active:scale-95"
        :aria-label="playing ? t('timeline.pause') : t('timeline.play')"
        @click="playing = !playing"
      >
        <svg v-if="!playing" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2.5 13 8l-9 5.5z" fill="currentColor" />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
          <rect x="9.3" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
        </svg>
      </button>
      <span class="text-sm tabular-nums text-[var(--muted)]">{{ mmss(total) }}</span>
    </div>

    <!-- rien ne se selectionne dans une barre d'outils : ca ne sert a personne
         et ca surligne tout des qu'on glisse une carte ou la tete de lecture -->
    <div class="flex h-full flex-col gap-2 select-none">
      <div class="flex items-center gap-1">
        <CycleMenu
          v-model:active-id="activeId"
          :cycles="cycles"
          :current="cycle"
          @create="askCreate"
          @rename="askRename"
          @remove="askRemove"
        />
      </div>

      <TimelineTrack
        v-model:block="block"
        v-model:zoom="zoom"
        :blocks="blocks"
        :elapsed="elapsed"
        :shape="shape"
        :color="color"
        :expression="expression"
        @update:blocks="(b: Block[]) => edit({ blocks: b })"
        @add="(s: StateId) => edit({ blocks: blocksWith(blocks, s) })"
        @seek="emit('seek', $event)"
      />

      <!-- barre d'outils, dans le coin : loupe, compteur, aperçu -->
      <div class="flex shrink-0 items-center justify-end gap-4">
        <ZoomSlider v-model:zoom="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" />

        <p class="text-xs tabular-nums text-[var(--muted)]">
          <span class="text-[var(--ink)]">{{ mmss(at) }}</span> / {{ mmss(total) }}
        </p>

        <!-- infobulle au survol ET au focus clavier, comme la barre laterale -->
        <span class="group relative flex">
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            :aria-label="t('timeline.preview')"
            @click="emit('preview')"
          >
            <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M1.8 10S5 5.2 10 5.2 18.2 10 18.2 10 15 14.8 10 14.8 1.8 10 1.8 10z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <circle cx="10" cy="10" r="2.3" fill="currentColor" />
            </svg>
          </button>
          <span
            class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[var(--paper)] opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
            role="tooltip"
          >
            {{ t('timeline.preview') }}
          </span>
        </span>
      </div>
    </div>

    <NameDialog
      v-model:open="nameOpen"
      v-model:value="nameDraft"
      :title="naming?.mode === 'rename' ? t('dialog.nameRenameTitle') : t('dialog.nameCreateTitle')"
      :label="t('dialog.nameField')"
      :submit-label="naming?.mode === 'rename' ? t('dialog.nameRename') : t('dialog.nameCreate')"
      @submit="onNamed"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="t('dialog.removeTitle', { name: removing ? nomDeCycle(removing) : '' })"
      :detail="removingDetail"
      :confirm-label="t('dialog.removeConfirm')"
      @confirm="onRemove"
    />
  </div>
</template>
