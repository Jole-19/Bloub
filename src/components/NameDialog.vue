<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Boite de dialogue de nommage. C'est un `<dialog>` natif ouvert en modal :
 * le navigateur fournit alors le piege a focus, la fermeture par Echap, le
 * retour du focus au declencheur et l'inertie du reste de la page — tout ce
 * qu'on reecrirait moins bien a la main. L'animation, elle, est dans
 * `styles.css` : elle a besoin de `@starting-style`, hors de portee des classes.
 */
const props = defineProps<{ title: string; label: string; submitLabel: string }>()
const open = defineModel<boolean>('open', { required: true })
const value = defineModel<string>('value', { required: true })
const emit = defineEmits<{ submit: [name: string] }>()

const el = ref<HTMLDialogElement | null>(null)
const field = ref<HTMLInputElement | null>(null)
const draft = ref('')

watch(open, async (on) => {
  const dialog = el.value
  if (!dialog) return
  if (on) {
    draft.value = value.value
    dialog.showModal()
    await nextTick()
    field.value?.select()
  } else if (dialog.open) {
    dialog.close()
  }
})

function submit() {
  const clean = draft.value.trim()
  // un nom vide ne veut rien dire : on garde la main plutot que de valider
  if (!clean) {
    field.value?.focus()
    return
  }
  emit('submit', clean)
  open.value = false
}

// le composant peut disparaitre alors que la boite est ouverte (changement de vue)
onBeforeUnmount(() => el.value?.open && el.value.close())
</script>

<template>
  <!-- `m-auto` remet le centrage natif de la modale : le reset de Tailwind
       passe `margin: 0` sur tout, et c'est cette marge auto qui centre -->
  <dialog
    ref="el"
    class="dialogue m-auto w-80 rounded-2xl bg-white p-5 text-[var(--ink)] shadow-xl"
    :aria-label="props.title"
    @close="open = false"
    @cancel.prevent="open = false"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <h2 class="text-sm font-semibold">{{ props.title }}</h2>

      <label class="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
        {{ props.label }}
        <input
          ref="field"
          v-model="draft"
          class="h-9 rounded-lg bg-black/5 px-2.5 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          type="text"
          maxlength="40"
          required
        />
      </label>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="h-8 cursor-pointer rounded-lg px-3 text-xs text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
          @click="open = false"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="h-8 cursor-pointer rounded-lg bg-[var(--ink)] px-3 text-xs text-[var(--paper)] transition hover:opacity-90 active:scale-95"
        >
          {{ props.submitLabel }}
        </button>
      </div>
    </form>
  </dialog>
</template>
