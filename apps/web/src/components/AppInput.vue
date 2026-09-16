<script setup lang="ts">
import { useId } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    type?: 'text' | 'email' | 'password';
    errorMessage?: string;
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    errorMessage: undefined,
    autocomplete: undefined,
  },
);

const model = defineModel<string>({ default: '' });
const inputId = useId();
const errorId = useId();
</script>

<template>
  <div class="app-input">
    <label :for="inputId" class="app-input__label">{{ label }}</label>
    <input
      :id="inputId"
      v-model="model"
      class="app-input__field"
      :type="type"
      :autocomplete="autocomplete"
      :aria-invalid="Boolean(props.errorMessage)"
      :aria-describedby="props.errorMessage ? errorId : undefined"
    />
    <p v-if="props.errorMessage" :id="errorId" class="app-input__error">
      {{ props.errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.app-input__label {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.app-input__field {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-input);
  background-color: var(--color-surface-card);
  color: var(--color-text);
  font-size: var(--font-body-md-size);
}

.app-input__field:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.app-input__field[aria-invalid='true'] {
  border-color: var(--color-error);
}

.app-input__error {
  font-size: var(--font-body-sm-size);
  color: var(--color-error);
}
</style>
