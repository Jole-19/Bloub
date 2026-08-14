<script setup lang="ts">
import { computed } from 'vue'

/**
 * Reglage de la loupe de la piste. Un `<input type="range">` natif plutot qu'un
 * curseur maison : il apporte le clavier (fleches, Origine/Fin), le pas, et
 * l'annonce aux lecteurs d'ecran. Seule l'apparence est reprise.
 *
 * La valeur n'est pas ecrite directement : le parent la recoit et decide du
 * point d'ancrage du zoom, pour que la piste ne parte pas ailleurs.
 */
const props = defineProps<{ zoom: number; min: number; max: number }>()
const emit = defineEmits<{ 'update:zoom': [value: number] }>()

const percent = computed(() => Math.round(props.zoom * 100))

function onInput(e: Event) {
  emit('update:zoom', Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- les deux pastilles disent le sens : petit a gauche, grand a droite -->
    <span class="h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden="true" />
    <input
      type="range"
      class="h-1 w-28 cursor-pointer accent-[var(--ink)]"
      :min="props.min"
      :max="props.max"
      step="0.01"
      :value="props.zoom"
      aria-label="Zoom de la piste"
      :aria-valuetext="`${percent} %`"
      @input="onInput"
    />
    <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden="true" />
    <span class="w-12 text-right text-xs tabular-nums text-[var(--muted)]">{{ percent }} %</span>
  </div>
</template>
