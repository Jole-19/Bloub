<script setup lang="ts">
import { ref, watch } from 'vue'
import { t } from '@/i18n'

/**
 * Confirmation d'une action destructrice. Meme `<dialog>` natif que le nommage
 * (piege a focus, Echap, fond assombri), et meme animation venue de
 * `styles.css`. Le focus s'ouvre sur « Annuler » : sur une suppression, la
 * touche Entree ne doit pas detruire.
 */
const props = defineProps<{ title: string; detail: string; confirmLabel: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const el = ref<HTMLDialogElement | null>(null)

watch(open, (on) => {
  const dialog = el.value
  if (!dialog) return
  if (on) dialog.showModal()
  else if (dialog.open) dialog.close()
})

function confirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <dialog
    ref="el"
    class="dialogue m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
    :aria-label="props.title"
    @close="open = false"
    @cancel.prevent="open = false"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-sm font-semibold">{{ props.title }}</h2>
        <p class="text-xs text-[var(--muted)]">{{ props.detail }}</p>
      </div>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          autofocus
          class="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
          @click="open = false"
        >
          {{ t('dialog.cancel') }}
        </button>
        <button
          type="button"
          class="h-8 cursor-pointer rounded-lg bg-[var(--danger)] px-3 text-xs text-white transition hover:opacity-90 active:scale-95"
          @click="confirm"
        >
          {{ props.confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
