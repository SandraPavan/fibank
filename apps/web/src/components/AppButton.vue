<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary';
    type?: 'button' | 'submit';
    disabled?: boolean;
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
  },
);
</script>

<template>
  <button :type="type" class="app-button" :class="variant" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-card);
  font-size: var(--font-body-md-size);
  font-weight: 600;
  line-height: var(--font-body-md-line);
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity 0.15s ease;
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.app-button.primary {
  background-color: var(--color-primary);
  color: var(--color-on-primary);
}

.app-button.primary:not(:disabled):hover {
  opacity: 0.92;
}

.app-button.secondary {
  background-color: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.app-button.secondary:not(:disabled):hover {
  background-color: var(--color-surface);
}
</style>
