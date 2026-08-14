<script setup lang="ts">
import { ref } from 'vue'

export type ViewId = 'animations' | 'personnaliser'

const view = defineModel<ViewId>({ default: 'personnaliser' })

const ITEMS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: 'personnaliser', label: 'Personnaliser', hint: 'Forme, expression et couleur' },
  { id: 'animations', label: 'Animations', hint: 'Jouer et déclencher les états' }
]

/**
 * Icone dont l'infobulle est masquee jusqu'a ce que le pointeur reparte : une
 * fois le clic fait la vue a change, l'infobulle n'a plus rien a annoncer et
 * rester affichee sous le curseur donne l'impression qu'elle est coincee.
 * `pointerdown` et pas `click` : au clavier (Entree) rien n'est masque, la
 * l'infobulle est la seule indication de ce qu'on vient de choisir.
 */
const muted = ref<ViewId | null>(null)
</script>

<template>
  <nav
    class="fixed top-[calc(50%_-_var(--timeline)_/_2)] left-4 z-20 -translate-y-1/2 rounded-2xl border border-[var(--line)] bg-white/85 p-1.5 shadow-sm backdrop-blur"
    aria-label="Sections"
  >
    <ul class="flex flex-col gap-1">
      <li
        v-for="item in ITEMS"
        :key="item.id"
        class="group relative"
        @pointerleave="muted = null"
      >
        <button
          type="button"
          class="peer flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition"
          :class="
            view === item.id
              ? 'bg-[var(--ink)] text-[var(--paper)]'
              : 'text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)]'
          "
          :aria-label="item.label"
          :aria-current="view === item.id ? 'page' : undefined"
          @pointerdown="muted = item.id"
          @click="view = item.id"
        >
          <!-- Animations : un triangle de lecture -->
          <svg
            v-if="item.id === 'animations'"
            width="17"
            height="17"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M6 3.6 16 10 6 16.4z" fill="currentColor" />
          </svg>
          <!-- Personnaliser : une palette -->
          <svg v-else width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M10 2.2a7.8 7.8 0 0 0 0 15.6c1.2 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.1a3.9 3.9 0 0 0 3.9-3.9C17.7 4.6 14.3 2.2 10 2.2z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <circle cx="6.6" cy="7.4" r="1.25" fill="currentColor" />
            <circle cx="10" cy="5.9" r="1.25" fill="currentColor" />
            <circle cx="6.2" cy="11.6" r="1.25" fill="currentColor" />
          </svg>
        </button>

        <!--
          Infobulle au survol ET au focus clavier : sinon la barre n'est
          utilisable qu'a la souris. `peer-focus-visible` et pas `focus-within` :
          apres un clic souris le bouton garde le focus, et l'infobulle restait
          affichee alors que le pointeur etait deja parti. Passer par `peer`
          (frere du bouton) plutot que par `group-has-[:focus-visible]` : dans
          `:has()`, Chromium ne reevalue pas `:focus-visible` et l'infobulle
          restait collee a l'ecran.
        -->
        <span
          class="pointer-events-none absolute top-1/2 left-full z-10 ml-2 -translate-y-1/2 translate-x-1 rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[var(--paper)] opacity-0 transition peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
          :class="muted === item.id && 'translate-x-1! opacity-0!'"
          role="tooltip"
        >
          <span class="font-medium">{{ item.label }}</span>
          <span class="ml-1.5 opacity-60">{{ item.hint }}</span>
        </span>
      </li>
    </ul>
  </nav>
</template>
