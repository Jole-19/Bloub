<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import CycleMenu from '@/components/CycleMenu.vue'
import GrokBot from '@/components/GrokBot.vue'
import BotTile from '@/components/BotTile.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NameDialog from '@/components/NameDialog.vue'
import {
  blocksWith,
  clampDuration,
  makeBlock,
  moveBlock,
  nextCycleId,
  offsetOf,
  STEP,
  totalDuration,
  uniqueName,
  type Cycle
} from '@/bot/cycles'
import { POSES, SEQUENCE, STATE_BY_ID, type StateId } from '@/bot/states'
import { nomDeCycle, pluriel, secondes, secondesCourtes, t } from '@/i18n'

const props = defineProps<{
  /** temps ecoule dans le bloc courant, pour la tete de lecture */
  elapsed: number
  shape: string
  color: string
  expression: string
}>()

/** Deplacement de la tete de lecture : seul le lecteur sait recaler le moteur. */
const emit = defineEmits<{ seek: [seconds: number] }>()

/** La palette du « + », dans l'ordre de la video. */
const PALETTE = SEQUENCE.map((id) => STATE_BY_ID.get(id)!)

const cycles = defineModel<Cycle[]>('cycles', { required: true })
const activeId = defineModel<string>('activeId', { required: true })
const block = defineModel<number>('block', { required: true })
const playing = defineModel<boolean>('playing', { required: true })

/**
 * Largeur d'une carte, en pixels par seconde de montage : la duree se lit donc
 * directement dans la piste. Le zoom multiplie cette echelle — il ne change
 * jamais le montage, seulement la loupe qu'on pose dessus.
 */
const BASE_SCALE = 44
// bornes de la loupe : au plus petit, le cycle de reference entier tient dans
// la piste ; au plus grand, une carte reste manipulable sans devenir un mur
const MIN_ZOOM = 0.45
const MAX_ZOOM = 2.4
const zoom = ref(1)

const scale = computed(() => BASE_SCALE * zoom.value)
const cycle = computed(() => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!)
const blocks = computed(() => cycle.value.blocks)
const total = computed(() => totalDuration(cycle.value))
const at = computed(() => offsetOf(cycle.value, block.value) + props.elapsed)

const track = ref<HTMLElement | null>(null)
/**
 * Nommage d'un cycle : meme boite pour la creation et le renommage, le second
 * cas portant l'id vise. La creation n'a lieu qu'a la validation — annuler ne
 * doit pas laisser un cycle vide derriere.
 */
const naming = ref<{ mode: 'create' | 'rename'; id?: string } | null>(null)
const nameDraft = ref('')
const dialogOpen = ref(false)
/** Montage en attente de confirmation de suppression. */
const removing = ref<Cycle | null>(null)
const confirmOpen = ref(false)
const removingDetail = computed(() => pluriel('dialog.removeDetail', removing.value?.blocks.length ?? 0))
/** Debordement de la piste, pour n'afficher les degrades que s'ils servent. */
const overflow = ref({ left: false, right: false })
/**
 * Defilement de la piste. L'infobulle de temps ne peut pas vivre dedans — le
 * conteneur rogne ce qui depasse en hauteur, et elle flotte au-dessus de la
 * regle — donc elle se positionne dehors, et doit retrancher ce defilement.
 */
const scrolled = ref(0)

function width(index: number) {
  return blocks.value[index]!.duration * scale.value
}

function label(index: number) {
  return t(`states.${blocks.value[index]!.state}`)
}

/**
 * `0:04` — les dixiemes changeraient trop vite pour etre lisibles.
 *
 * Seul format qui ne passe pas par la couche i18n : le mm:ss est la meme
 * convention dans les trois langues, et il n'a pas d'unite a traduire.
 */
function mmss(instant: number) {
  const s = Math.max(0, Math.floor(instant))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------- graduation */

/**
 * Pas de la regle : le premier de la liste qui laisse au moins 52 px entre deux
 * reperes chiffres. C'est ce qui fait qu'en dezoomant on passe de 1 s a 5 s puis
 * a 10 s au lieu d'empiler des chiffres illisibles.
 */
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60]

const ticks = computed(() => {
  const major = STEPS.find((s) => s * scale.value >= 52) ?? 60
  // reperes intermediaires, tant qu'ils ne se collent pas les uns aux autres
  const step = (major / 5) * scale.value >= 7 ? major / 5 : major
  const out: Array<{ t: number; major: boolean }> = []
  for (let i = 0; i * step <= total.value + 1e-6; i++) {
    const t = i * step
    out.push({ t, major: Math.abs(t / major - Math.round(t / major)) < 1e-6 })
  }
  return out
})

/** `0s`, `10s`, `0,5s` — court, c'est une graduation, pas un compteur. */
function graduation(instant: number) {
  return secondesCourtes(instant, Number.isInteger(instant) ? 0 : 1)
}

/** Le compteur du haut arrondit a la seconde ; en deplacant, on veut le dixieme. */
const exact = computed(() => secondes(at.value))

function onScroll() {
  const el = track.value
  if (!el) return
  scrolled.value = el.scrollLeft
  overflow.value = {
    left: el.scrollLeft > 4,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  }
}

/**
 * Change la loupe en gardant sous le pointeur la seconde qui y etait deja :
 * sans ca, zoomer sur une carte precise la fait fuir hors de l'ecran.
 */
function zoomAt(next: number, clientX?: number) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
  if (clamped === zoom.value) return
  const el = track.value
  if (!el || clientX === undefined) {
    zoom.value = clamped
    return
  }
  const x = clientX - el.getBoundingClientRect().left
  const seconde = (el.scrollLeft + x) / scale.value
  zoom.value = clamped
  nextTick(() => {
    el.scrollLeft = seconde * scale.value - x
    onScroll()
  })
}

/**
 * Molette et trackpad sur la piste :
 * - pincement du trackpad (le navigateur l'annonce comme une molette + `ctrl`,
 *   c'est la convention) ou `ctrl`/`cmd` + molette → loupe ;
 * - deux doigts a l'horizontale → defilement, c'est deja `deltaX` ;
 * - molette de souris, qui n'a pas d'axe horizontal → on renvoie son `deltaY`
 *   sur le defilement de la piste, sinon elle ne servirait a rien ici.
 * `deltaMode` vaut 1 quand le systeme compte en lignes et pas en pixels (des
 * souris sous Firefox) : sans le facteur, le geste serait quinze fois trop lent.
 */
function onWheel(e: WheelEvent) {
  const el = track.value
  if (!el) return
  const unit = e.deltaMode === 1 ? 16 : 1
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    zoomAt(zoom.value * Math.exp((-e.deltaY * unit) / 180), e.clientX)
    return
  }
  if (el.scrollWidth <= el.clientWidth) return
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!d) return
  e.preventDefault()
  el.scrollLeft += d * unit
}

onMounted(onScroll)
watch([total, scale, blocks], () => nextTick(onScroll))

/* ---------------------------------------------------------------- montage */

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
  dialogOpen.value = true
}

function askRename(id: string) {
  naming.value = { mode: 'rename', id }
  const vise = cycles.value.find((c) => c.id === id)
  // le montage d'amorce n'a pas de nom propre : on part de celui qui s'affiche,
  // sinon renommer commencerait sur un champ vide
  nameDraft.value = vise ? nomDeCycle(vise) : ''
  dialogOpen.value = true
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

const addButton = ref<HTMLButtonElement | null>(null)
const picker = ref<HTMLElement | null>(null)
const pickerPos = ref<Record<string, string>>({})

/**
 * Ouvre la palette au-dessus du « + ». Elle vit dans la couche superieure, donc
 * sa position est calculee ici, en coordonnees d'ecran, et bornee pour ne pas
 * sortir par la droite quand le bouton est en bout de piste.
 */
function openPicker() {
  const bouton = addButton.value
  const boite = picker.value
  if (!bouton || !boite) return
  const r = bouton.getBoundingClientRect()
  const largeur = 288
  pickerPos.value = {
    position: 'fixed',
    // les styles par defaut d'un popover posent `inset: 0` : sans remettre le
    // haut et la droite a `auto`, le calage est sur-contraint et c'est `top: 0`
    // qui gagne — la palette se colle en haut de l'ecran
    top: 'auto',
    right: 'auto',
    left: `${Math.max(8, Math.min(r.right - largeur, window.innerWidth - largeur - 8))}px`,
    bottom: `${window.innerHeight - r.top + 8}px`
  }
  boite.showPopover()
}

function addBlock(state: StateId) {
  edit({ blocks: blocksWith(blocks.value, state) })
  picker.value?.hidePopover()
}

function removeBlock(index: number) {
  // la derniere carte ne part pas : un montage vide n'aurait rien a jouer
  if (blocks.value.length < 2) return
  edit({ blocks: blocks.value.filter((_, i) => i !== index) })
  // le curseur suit : une carte retiree avant lui le decale d'un cran, et il ne
  // doit jamais pointer au-dela de la piste
  if (index < block.value) block.value -= 1
  else if (block.value >= blocks.value.length) block.value = blocks.value.length - 1
}

/* ------------------------------------------------------ glisser / etirer */

type Drag = { from: number; startX: number; moved: boolean }
type Resize = { index: number; startX: number; startDuration: number }

const drag = ref<Drag | null>(null)
const resize = ref<Resize | null>(null)

/** Index de la carte sous une position, en secondes depuis le debut de la piste. */
function indexAt(t: number) {
  let acc = 0
  for (let i = 0; i < blocks.value.length; i++) {
    acc += blocks.value[i]!.duration
    if (t < acc) return i
  }
  return blocks.value.length - 1
}

function pointerSeconds(e: PointerEvent) {
  const box = track.value?.getBoundingClientRect()
  if (!box) return 0
  return (e.clientX - box.left + (track.value?.scrollLeft ?? 0)) / scale.value
}

function onBlockDown(index: number, e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag.value = { from: index, startX: e.clientX, moved: false }
}

function onBlockMove(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  if (Math.abs(e.clientX - d.startX) > 4) d.moved = true
  if (!d.moved) return
  const cible = indexAt(pointerSeconds(e))
  if (cible === d.from || cible < 0) return
  // le curseur suit la carte qu'on deplace, sinon la lecture sauterait ailleurs
  const suivi = block.value === d.from ? cible : block.value
  edit({ blocks: moveBlock(blocks.value, d.from, cible) })
  block.value = suivi
  d.from = cible
}

function onBlockUp(index: number) {
  const d = drag.value
  drag.value = null
  // un clic sans deplacement, c'est un saut de la tete de lecture
  if (d && !d.moved) block.value = index
}

/* ----------------------------------------------------------------- scrub */

const scrubbing = ref(false)

function scrubTo(e: PointerEvent) {
  emit('seek', Math.max(0, Math.min(total.value - 0.001, pointerSeconds(e))))
}

function onRulerDown(e: PointerEvent) {
  // sans ca, promener la tete de lecture surligne les graduations au passage :
  // le navigateur demarre une selection de texte sur le `mousedown` induit
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  scrubbing.value = true
  scrubTo(e)
}

function onRulerMove(e: PointerEvent) {
  if (scrubbing.value) scrubTo(e)
}

function onResizeDown(index: number, e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  resize.value = { index, startX: e.clientX, startDuration: blocks.value[index]!.duration }
}

function onResizeMove(e: PointerEvent) {
  const r = resize.value
  if (!r) return
  setDuration(r.index, r.startDuration + (e.clientX - r.startX) / scale.value)
}

function setDuration(index: number, seconds: number) {
  const b = blocks.value[index]
  if (!b) return
  const duration = clampDuration(b.state, seconds)
  if (duration === b.duration) return
  edit({ blocks: blocks.value.map((old, i) => (i === index ? { ...old, duration } : old)) })
}

/** Le clavier etire aussi : la poignee est un bouton, pas seulement une zone. */
function onResizeKey(index: number, delta: number) {
  setDuration(index, blocks.value[index]!.duration + delta)
}

// La carte courante reste visible quand la piste deborde de la fenetre. On ne
// regarde que le curseur : au zoom, c'est `zoomAt` qui commande le defilement,
// et les deux se battraient pour la meme barre.
watch(block, () => {
  const el = track.value
  if (!el) return
  const x = offsetOf(cycle.value, block.value) * scale.value
  if (x < el.scrollLeft || x + width(block.value) > el.scrollLeft + el.clientWidth) {
    el.scrollTo({ left: Math.max(0, x - 24), behavior: 'smooth' })
  }
})

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

        <!-- loupe : agrandit les cartes, jamais le montage -->
        <div class="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)] disabled:opacity-30 disabled:hover:bg-transparent"
            :aria-label="t('timeline.zoomOut')"
            :disabled="zoom <= MIN_ZOOM"
            @click="zoomAt(zoom / 1.3)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
          <button
            type="button"
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)] disabled:opacity-30 disabled:hover:bg-transparent"
            :aria-label="t('timeline.zoomIn')"
            :disabled="zoom >= MAX_ZOOM"
            @click="zoomAt(zoom * 1.3)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M6 2v8M2 6h8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- piste -->
      <div class="relative flex-1">
        <div
          ref="track"
          class="h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          @scroll="onScroll"
          @wheel="onWheel"
        >
          <!-- la piste garde de la place pour la carte « + » a sa suite -->
          <div
            class="relative flex h-full flex-col"
            :style="{ width: `${total * scale + 76}px` }"
          >
            <!--
              Regle graduee : elle sert aussi de zone de deplacement. On attrape
              n'importe ou dessus pour promener la tete de lecture, comme sur un
              montage video — c'est la seule facon d'atteindre un point PRECIS
              d'une carte, le clic sur une carte ne fait que sauter a son debut.
            -->
            <div
              class="relative h-7 shrink-0 cursor-ew-resize pt-1 select-none"
              @pointerdown="onRulerDown"
              @pointermove="onRulerMove"
              @pointerup="scrubbing = false"
              @pointercancel="scrubbing = false"
            >
              <span
                v-for="tick in ticks"
                :key="tick.t"
                class="absolute bottom-1.5 flex items-end gap-1"
                :style="{ transform: `translateX(${tick.t * scale}px)` }"
              >
                <span
                  class="block w-px bg-[var(--line)]"
                  :class="tick.major ? 'h-3' : 'h-1.5'"
                />
                <span
                  v-if="tick.major"
                  class="-mb-0.5 text-xs leading-none text-[var(--muted)]"
                >
                  {{ graduation(tick.t) }}
                </span>
              </span>
            </div>

            <ul class="flex flex-1 items-stretch">
              <!--
                La largeur du <li> vaut exactement la duree de la carte : la
                gouttiere est un padding interne, sinon les cartes decaleraient la
                piste et la tete de lecture ne tomberait plus en face.
              -->
              <li
                v-for="(b, i) in blocks"
                :key="`${i}-${b.state}`"
                class="group relative shrink-0 pr-1"
                :style="{ width: `${b.duration * scale}px` }"
              >
                <button
                  type="button"
                  class="flex h-full w-full cursor-grab flex-col justify-between overflow-hidden rounded-lg px-1.5 py-1 text-left transition select-none active:cursor-grabbing"
                  :class="
                    i === block
                      ? 'bg-white ring-2 ring-[var(--ink)] ring-inset'
                      : 'bg-black/[0.045] hover:bg-black/[0.08]'
                  "
                  :aria-label="t('timeline.blockAria', { state: label(i), duration: secondes(b.duration) })"
                  :aria-current="i === block ? 'true' : undefined"
                  @pointerdown="onBlockDown(i, $event)"
                  @pointermove="onBlockMove"
                  @pointerup="onBlockUp(i)"
                  @pointercancel="drag = null"
                  @keydown.enter.prevent="block = i"
                  @keydown.space.prevent="block = i"
                >
                  <!-- la miniature EST l'identite de la carte, comme la vignette
                       d'une page : le nom n'apprendrait rien de plus, il ne
                       reste que dans l'etiquette du bouton, pour le lecteur
                       d'ecran -->
                  <span class="flex min-w-0 flex-1 items-center justify-center">
                    <GrokBot
                      v-if="width(i) > 44"
                      class="shrink-0"
                      :state="b.state"
                      :size="Math.min(56, Math.max(30, width(i) * 0.5))"
                      :shape="shape"
                      :color="color"
                      :expression="expression"
                      :paper="i === block ? '#ffffff' : '#f2f2f2'"
                      :frozen-at="POSES[b.state]"
                    />
                  </span>
                  <span
                    class="flex items-baseline justify-between gap-1 text-xs leading-none tabular-nums"
                    :class="i === block ? 'font-medium text-[var(--ink)]' : 'text-[var(--muted)]'"
                  >
                    <span>{{ i + 1 }}</span>
                    <span v-if="width(i) > 60" class="truncate">{{ secondes(b.duration) }}</span>
                  </span>
                </button>

                    <!-- poignee de duree : bouton a part entiere, donc utilisable au clavier -->
                  <button
                    type="button"
                    class="absolute inset-y-2 right-0.5 w-1 cursor-ew-resize rounded-full bg-[var(--muted)] opacity-0 transition group-hover:opacity-60 hover:opacity-100! focus-visible:opacity-100"
                    :aria-label="
                      t('timeline.blockDurationAria', {
                        state: label(i),
                        duration: secondes(b.duration)
                      })
                    "
                    @pointerdown="onResizeDown(i, $event)"
                    @pointermove="onResizeMove"
                    @pointerup="resize = null"
                    @pointercancel="resize = null"
                    @keydown.left.prevent="onResizeKey(i, -STEP)"
                    @keydown.right.prevent="onResizeKey(i, STEP)"
                  />
                  <button
                    v-if="blocks.length > 1"
                    type="button"
                    class="absolute top-1 right-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/10 text-xs leading-none text-[var(--ink)] opacity-0 transition group-hover:opacity-100 hover:bg-black/20 focus-visible:opacity-100"
                    :aria-label="t('timeline.blockRemoveAria', { state: label(i) })"
                    @click="removeBlock(i)"
                  >
                    ×
                  </button>
              </li>

              <!-- ajout depuis la piste, sans aller jusqu'a la palette de droite -->
              <li class="w-[72px] shrink-0 pl-1">
                <button
                  ref="addButton"
                  type="button"
                  class="flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--line)] text-lg leading-none text-[var(--muted)] transition hover:border-[var(--muted)] hover:text-[var(--ink)]"
                  aria-label="Ajouter une animation"
                  aria-haspopup="menu"
                  @click="openPicker"
                >
                  +
                </button>
              </li>
            </ul>

            <!--
              Tete de lecture : seule sa transformation change d'une image a
              l'autre, et elle vit dans la piste, donc elle defile avec elle. Sa
              poignee est dans la regle, la ou on l'attrape.
            -->
            <div
              class="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-full bg-[var(--ink)]"
              :style="{ transform: `translateX(${at * scale}px)` }"
            >
              <span
                class="absolute -top-0.5 -left-[5px] h-3 w-3 rounded-full border-2 border-[var(--paper)] bg-[var(--ink)]"
              />
            </div>
          </div>
        </div>

        <!--
          Temps exact pendant le deplacement : au dixieme, la ou le compteur du
          haut arrondit a la seconde. Elle flotte au-dessus de la regle, donc
          hors du conteneur qui defile — d'ou le `scrolled` retranche.
        -->
        <div
          v-if="scrubbing"
          class="pointer-events-none absolute top-0 left-0 z-10"
          :style="{ transform: `translate(${at * scale - scrolled}px, -70%)` }"
        >
          <span
            class="block -translate-x-1/2 rounded-md bg-[var(--ink)] px-2 py-1 text-xs tabular-nums text-[var(--paper)] shadow-sm"
          >
            {{ exact }}
          </span>
        </div>

        <!-- degrades de debordement : la piste continue par la -->
        <div
          v-if="overflow.left"
          class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--paper)] to-transparent"
        />
        <div
          v-if="overflow.right"
          class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--paper)] to-transparent"
        />
      </div>
    </div>

    <NameDialog
      v-model:open="dialogOpen"
      v-model:value="nameDraft"
      :title="naming?.mode === 'rename' ? 'Renommer le cycle' : 'Nouveau cycle'"
      label="Nom du cycle"
      :submit-label="naming?.mode === 'rename' ? 'Renommer' : 'Créer'"
      @submit="onNamed"
    />

    <!--
      Palette du « + ». `popover` la promeut dans la couche superieure du
      navigateur : c'est ce qui la fait echapper au conteneur de la piste, qui
      rogne verticalement (`overflow-y-hidden`) — elle y etait coupee en deux.
      En prime, le clic a cote et Echap la referment sans code a nous. `m-0` :
      un popover est centre par une marge auto, comme une modale.
    -->
    <div
      ref="picker"
      popover
      role="menu"
      class="m-0 w-72 rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/5"
      :style="pickerPos"
    >
      <div class="grid grid-cols-4 gap-1.5">
        <BotTile
          v-for="s in PALETTE"
          :key="s.id"
          :label="s.label"
          :selected="false"
          :state="s.id"
          :shape="shape"
          :color="color"
          :expression="expression"
          :frozen-at="POSES[s.id]"
          @click="addBlock(s.id)"
        />
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="`Supprimer « ${removing?.name} » ?`"
      :detail="removingDetail"
      confirm-label="Supprimer"
      @confirm="onRemove"
    />
  </div>
</template>
