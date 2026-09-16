<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
  }>(),
  {
    title: undefined,
  },
);
</script>

<template>
  <section class="app-card">
    <header v-if="title" class="app-card__header">
      <h2 class="app-card__title">
        {{ title }}
      </h2>
    </header>
    <div class="app-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.app-card {
  background-color: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--spacing-lg);
}

.app-card__header {
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.app-card__title {
  font-size: var(--font-headline-sm-size);
  line-height: var(--font-headline-sm-line);
}

.app-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
</style>
