<script setup lang="ts">
const LENGTH = 6;

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });

const digits = defineModel<string>({ default: '' });

/**
 * A senha nunca é exibida — só o comprimento digitado, como pontos
 * preenchidos/vazios (mockup Stitch `confirmar_com_senha_finbank_pix`).
 */
function press(digit: string) {
  if (digits.value.length >= LENGTH) return;
  digits.value += digit;
}

function backspace() {
  digits.value = digits.value.slice(0, -1);
}
</script>

<template>
  <div class="app-pin-pad">
    <div class="app-pin-pad__dots" role="presentation">
      <span
        v-for="index in LENGTH"
        :key="index"
        class="app-pin-pad__dot"
        :class="{ 'app-pin-pad__dot--filled': index <= digits.length }"
      />
    </div>

    <div class="app-pin-pad__keys">
      <button
        v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
        :key="digit"
        type="button"
        class="app-pin-pad__key"
        :disabled="disabled"
        @click="press(digit)"
      >
        {{ digit }}
      </button>
      <span class="app-pin-pad__key app-pin-pad__key--empty" />
      <button
        type="button"
        class="app-pin-pad__key"
        :disabled="disabled"
        @click="press('0')"
      >
        0
      </button>
      <button
        type="button"
        class="app-pin-pad__key"
        :disabled="disabled || digits.length === 0"
        aria-label="Apagar dígito"
        @click="backspace"
      >
        ⌫
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-pin-pad {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.app-pin-pad__dots {
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm);
}

.app-pin-pad__dot {
  width: 1rem;
  height: 1rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-input-border);
  background-color: var(--color-surface-card);
}

.app-pin-pad__dot--filled {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.app-pin-pad__keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  max-width: 16rem;
  margin: 0 auto;
}

.app-pin-pad__key {
  height: 3rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface-card);
  font-size: var(--font-body-lg-size);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
}

.app-pin-pad__key:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.app-pin-pad__key:not(:disabled):hover {
  background-color: var(--color-surface);
}

.app-pin-pad__key--empty {
  border: none;
  background: none;
}
</style>
