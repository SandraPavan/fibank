<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import AppPinPad from '../components/AppPinPad.vue';
import { formatCents } from '../lib/currency';
import { usePixTransferStore } from '../stores/pixTransfer';

/**
 * T03 — Confirmar com senha (DEV-032/033).
 *
 * A senha só existe neste `ref` local, nunca no store nem em
 * localStorage/sessionStorage/URL — desmonta junto com a view.
 *
 * Roteamento do resultado:
 * - `APPROVED` → T04 (comprovante, só para aprovado — RP-05);
 * - erro conhecido (`confirmOutcome === 'known-error'`, ex.: senha
 *   errada) → fica em T03, mensagem inline, usuário corrige e tenta de
 *   novo sem navegar;
 * - resultado desconhecido (`confirmOutcome === 'unknown-result'`,
 *   timeout/falha de rede) → T05 (erro genérico), que não é a mesma
 *   coisa que uma rejeição — dev/04-fluxos.md (F05/RP-07);
 * - `REVIEW` fica em T03 com uma mensagem informativa (nenhuma das seis
 *   telas foi desenhada para "em análise").
 */

const router = useRouter();
const store = usePixTransferStore();
const digits = ref('');
const reviewMessage = ref<string | null>(null);

const canConfirm = computed(
  () => digits.value.length === 6 && !store.confirming,
);

onMounted(() => {
  if (!store.requestId || !store.recipient) {
    router.replace({ name: 't01' });
  }
});

function handleCancel() {
  digits.value = '';
  router.push({ name: 't02' });
}

async function handleConfirm() {
  reviewMessage.value = null;
  const result = await store.confirm(digits.value);
  digits.value = '';

  if (!result) {
    if (store.confirmOutcome === 'unknown-result') {
      router.push({ name: 't05' });
    }
    return;
  }

  if (result.status === 'APPROVED') {
    router.push({
      name: 't04',
      params: { transactionId: result.transactionId },
    });
    return;
  }

  reviewMessage.value =
    'Operação em análise. Você será avisado quando for concluída.';
}
</script>

<template>
  <AppCard v-if="store.recipient" title="Confirmar com senha">
    <dl class="senha-view__summary">
      <div>
        <dt>Favorecido</dt>
        <dd>{{ store.recipient.name }}</dd>
      </div>
      <div>
        <dt>Valor</dt>
        <dd>{{ formatCents(store.amountCents) }}</dd>
      </div>
    </dl>

    <p class="senha-view__hint">
      Digite sua senha transacional de 6 dígitos para confirmar a operação.
    </p>

    <AppPinPad v-model="digits" :disabled="store.confirming" />

    <p v-if="store.confirmError" class="senha-view__error" role="alert">
      {{ store.confirmError }}
    </p>
    <output v-if="reviewMessage" class="senha-view__review">
      {{ reviewMessage }}
    </output>

    <div class="senha-view__actions">
      <AppButton
        variant="secondary"
        :disabled="store.confirming"
        @click="handleCancel"
      >
        Cancelar
      </AppButton>
      <AppButton :disabled="!canConfirm" @click="handleConfirm">
        {{ store.confirming ? 'Confirmando…' : 'Confirmar transação' }}
      </AppButton>
    </div>
  </AppCard>
</template>

<style scoped>
.senha-view__summary {
  display: grid;
  gap: var(--spacing-md);
  margin: 0;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface);
}

.senha-view__summary dt {
  font-size: var(--font-body-sm-size);
  color: var(--color-text-secondary);
}

.senha-view__summary dd {
  margin: 0;
  font-size: var(--font-body-md-size);
  font-weight: 600;
}

.senha-view__hint {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}

.senha-view__error {
  font-size: var(--font-body-sm-size);
  color: var(--color-error);
  text-align: center;
}

.senha-view__review {
  font-size: var(--font-body-sm-size);
  color: var(--color-warning);
  text-align: center;
}

.senha-view__actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}
</style>
