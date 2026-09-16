<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'success' | 'warning' | 'error';
  label: string;
}>();

/**
 * RNF-07 (acessibilidade): o status nunca é indicado somente por cor.
 * Cada variante carrega também um símbolo textual fixo.
 */
const symbols: Record<'success' | 'warning' | 'error', string> = {
  success: '✓',
  warning: '!',
  error: '✕',
};

const symbol = computed(() => symbols[props.status]);
</script>

<template>
  <span class="status-pill" :class="status">
    <span aria-hidden="true" class="status-pill__symbol">{{ symbol }}</span>
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-pill);
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
}

.status-pill__symbol {
  font-weight: 700;
}

.status-pill.success {
  background-color: var(--color-success-bg);
  color: var(--color-success);
}

.status-pill.warning {
  background-color: var(--color-warning-bg);
  color: var(--color-warning);
}

.status-pill.error {
  background-color: var(--color-error-bg);
  color: var(--color-error);
}
</style>
