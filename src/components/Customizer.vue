<script setup lang="ts">
import GrokBot from '@/components/GrokBot.vue'
import { COLORS, SHAPES } from '@/bot/skins'

const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })

/**
 * Les vignettes sont figees a la meme date que la pose de repos : elles montrent
 * la forme telle qu'elle apparaitra, avec les yeux, et pas un aplat abstrait.
 */
const PREVIEW_AT = 1
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">Forme</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <button
        v-for="s in SHAPES"
        :key="s.id"
        type="button"
        class="flex cursor-pointer items-center justify-center rounded-xl border-2 p-1 transition"
        :class="
          s.id === shape
            ? 'border-[var(--ink)]'
            : 'border-transparent hover:border-[var(--line)]'
        "
        :aria-label="s.label"
        :aria-pressed="s.id === shape"
        @click="shape = s.id"
      >
        <GrokBot
          state="idle"
          :size="66"
          :shape="s.id"
          :color="color"
          :frozen-at="PREVIEW_AT"
        />
      </button>
    </div>

    <h2 class="mt-5 text-sm font-semibold">Couleur</h2>
    <div class="mt-2 grid grid-cols-6 gap-1.5">
      <button
        v-for="c in COLORS"
        :key="c.id"
        type="button"
        class="flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
        :class="c.id === color ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'"
        :aria-label="c.label"
        :aria-pressed="c.id === color"
        @click="color = c.id"
      >
        <!-- liseré interne : sinon la pastille creme disparait sur fond clair -->
        <span
          class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
          :style="{ background: c.hex }"
        />
      </button>
    </div>
  </div>
</template>
