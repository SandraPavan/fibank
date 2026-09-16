<script setup lang="ts">
import { useId } from 'vue';
import { digitsToCents, formatCents } from '../lib/currency';

defineProps<{
  label: string;
  errorMessage?: string;
}>();

const cents = defineModel<number>({ default: 0 });
const inputId = useId();
const errorId = useId();

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  cents.value = digitsToCents(target.value);
  target.value = formatCents(cents.value);
}
</script>

<template>
  <div class="app-currency-input">
    <label :for="inputId" class="app-currency-input__label">{{ label }}</label>
    <input
      :id="inputId"
      class="app-currency-input__field"
      type="text"
      inputmode="numeric"
      :value="formatCents(cents)"
      :aria-invalid="Boolean(errorMessage)"
      :aria-describedby="errorMessage ? errorId : undefined"
      @input="handleInput"
    />
    <p v-if="errorMessage" :id="errorId" class="app-currency-input__error">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.app-currency-input {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.app-currency-input__label {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.app-currency-input__field {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-input);
  background-color: var(--color-surface-card);
  color: var(--color-text);
  font-size: var(--font-body-lg-size);
  font-weight: 600;
}

.app-currency-input__field:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.app-currency-input__field[aria-invalid='true'] {
  border-color: var(--color-error);
}

.app-currency-input__error {
  font-size: var(--font-body-sm-size);
  color: var(--color-error);
}
</style>
