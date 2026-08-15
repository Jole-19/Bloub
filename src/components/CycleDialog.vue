<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { t } from '@/i18n'
import {
  FONDS_GIF,
  FORMATS_CYCLE,
  cycleAccepteTransparence,
  type FondGif,
  type FormatCycle
} from '@/ui/export'
import { useModalDialog } from '@/ui/useModalDialog'

/**
 * Choix du format avant d'exporter le montage.
 *
 * Le groupe « fond » n'apparait QUE pour le GIF, au lieu d'etre affiche grise :
 * la video n'a pas de canal alpha du tout, donc il n'y a pas de choix a refuser,
 * il n'y a pas de choix.
 */
const props = defineProps<{ avancement: number | null }>()
const open = defineModel<boolean>('open', { required: true })
const format = defineModel<FormatCycle>('format', { required: true })
const fond = defineModel<FondGif>('fond', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const boite = useTemplateRef<HTMLDialogElement>('boite')
useModalDialog(open, boite)

const occupe = computed(() => props.avancement !== null)
const pourcent = computed(() => Math.round((props.avancement ?? 0) * 100))

function confirm() {
  // La boite reste ouverte pendant l'encodage : c'est elle qui porte la
  // progression, et un cycle de trente secondes ne s'exporte pas instantanement.
  if (!occupe.value) emit('confirm')
}
</script>

<template>
  <dialog
    ref="boite"
    class="dialogue m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
    :aria-label="t('timeline.export')"
    @close="open = false"
    @cancel.prevent="open = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="confirm">
      <div class="flex flex-col gap-1">
        <h2 class="text-sm font-semibold">{{ t('timeline.export') }}</h2>
        <p class="text-xs text-[var(--muted)]">{{ t('export.cycleDetail') }}</p>
      </div>

      <fieldset class="flex flex-col gap-1" :disabled="occupe">
        <legend class="sr-only">{{ t('export.cycleFormat') }}</legend>
        <label
          v-for="(choix, i) in FORMATS_CYCLE"
          :key="choix"
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5"
        >
          <input
            v-model="format"
            type="radio"
            name="format"
            :value="choix"
            :autofocus="i === 0"
            class="accent-[var(--ink)]"
          />
          <span class="flex flex-col">
            {{ t(`export.cycle_${choix}`) }}
            <span class="text-xs text-[var(--muted)]">{{ t(`export.cycle_${choix}_aide`) }}</span>
          </span>
        </label>
      </fieldset>

      <!-- seul le GIF a un alpha a offrir : cf. la doc du composant -->
      <fieldset
        v-if="cycleAccepteTransparence(format)"
        class="flex flex-col gap-1"
        :disabled="occupe"
      >
        <legend class="sr-only">{{ t('export.gifBackground') }}</legend>
        <label
          v-for="choix in FONDS_GIF"
          :key="choix"
          class="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-black/5"
        >
          <input
            v-model="fond"
            type="radio"
            name="fondCycle"
            :value="choix"
            class="accent-[var(--ink)]"
          />
          {{ t(`export.fond_${choix}`) }}
        </label>
      </fieldset>

      <!-- la progression remplace les boutons : rien d'autre a faire qu'attendre -->
      <div v-if="occupe" class="flex flex-col gap-1.5">
        <!--
          Pas de `transition` sur la largeur : une transition sur `width` passe par
          le layout, donc par le thread principal — que l'encodage sature. La barre
          restait figee sur sa premiere valeur pendant que le pourcentage, lui,
          avancait. Et elle n'apporte rien : la valeur change des centaines de fois.
        -->
        <div class="h-1.5 overflow-hidden rounded-full bg-black/10">
          <div class="h-full rounded-full bg-[var(--ink)]" :style="{ width: `${pourcent}%` }" />
        </div>
        <p class="text-xs tabular-nums text-[var(--muted)]">
          {{ t('export.cycleProgress') }} {{ pourcent }} %
        </p>
      </div>

      <div v-else class="flex justify-end gap-2">
        <button
          type="button"
          class="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
          @click="open = false"
        >
          {{ t('dialog.cancel') }}
        </button>
        <button
          type="submit"
          class="h-8 cursor-pointer rounded-lg bg-[var(--ink)] px-3 text-xs text-[var(--paper)] transition hover:opacity-90 active:scale-95"
        >
          {{ t('export.gifConfirm') }}
        </button>
      </div>
    </form>
  </dialog>
</template>
