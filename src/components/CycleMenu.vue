<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Cycle } from '@/bot/cycles'

/**
 * Choix du montage. Un `<select>` natif ne peut pas porter la ligne "Nouveau"
 * ni la suppression d'une entree, d'ou ce menu — et il s'ouvre vers le haut,
 * la barre etant en bas de l'ecran.
 */
defineProps<{ cycles: Cycle[]; current: Cycle }>()
const activeId = defineModel<string>('activeId', { required: true })
const emit = defineEmits<{ create: []; remove: [id: string]; rename: [id: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function choose(id: string) {
  activeId.value = id
  open.value = false
}

function create() {
  open.value = false
  emit('create')
}

function onOutside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}

watch(open, (on) => {
  if (on) window.addEventListener('pointerdown', onOutside)
  else window.removeEventListener('pointerdown', onOutside)
})

onBeforeUnmount(() => window.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition hover:bg-black/5"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ current.name }}
      <!-- le cadenas dit ce que la phrase disait avant : ce cycle ne s'edite pas -->
      <svg
        v-if="current.locked"
        width="11"
        height="11"
        viewBox="0 0 12 12"
        aria-hidden="true"
        class="text-[var(--muted)]"
      >
        <path
          d="M4 5.4V3.9a2 2 0 0 1 4 0v1.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <rect x="2.7" y="5.4" width="6.6" height="4.6" rx="1.3" fill="currentColor" />
      </svg>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="text-[var(--muted)]">
        <path
          d="M2 6.5 5 3.5l3 3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5"
      role="menu"
    >
      <div
        v-for="c in cycles"
        :key="c.id"
        class="group/row flex items-center gap-1"
      >
        <button
          type="button"
          role="menuitem"
          class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-black/5"
          @click="choose(c.id)"
        >
          <span class="w-3 shrink-0 text-[var(--ink)]">{{ c.id === activeId ? '✓' : '' }}</span>
          <span class="truncate">{{ c.name }}</span>
        </button>
        <!-- renommer et supprimer vivent ici : la barre n'a pas a porter deux
             boutons de plus pour une action qu'on fait une fois -->
        <template v-if="!c.locked">
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted)] opacity-0 transition group-hover/row:opacity-100 hover:bg-black/5 hover:text-[var(--ink)] focus-visible:opacity-100"
            :aria-label="`Renommer ${c.name}`"
            @click="((open = false), emit('rename', c.id))"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M8.2 1.8 10.2 3.8 4.4 9.6 1.8 10.2 2.4 7.6z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.1"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted)] opacity-0 transition group-hover/row:opacity-100 hover:bg-black/5 hover:text-[var(--ink)] focus-visible:opacity-100"
            :aria-label="`Supprimer ${c.name}`"
            @click="emit('remove', c.id)"
          >
            ×
          </button>
        </template>
      </div>

      <div class="my-1 h-px bg-[var(--line)]" />

      <button
        type="button"
        role="menuitem"
        class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-black/5"
        @click="create"
      >
        <span class="w-3 shrink-0 text-[var(--muted)]">+</span>
        Nouveau cycle
      </button>
    </div>
  </div>
</template>
