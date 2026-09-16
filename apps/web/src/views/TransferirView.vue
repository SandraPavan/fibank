<script setup lang="ts">
import type { AccountResponse, RecipientResponse } from '@finbank/contracts';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAccount } from '../api/banking';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import AppCurrencyInput from '../components/AppCurrencyInput.vue';
import AppInput from '../components/AppInput.vue';
import { formatCents } from '../lib/currency';
import { usePixTransferStore } from '../stores/pixTransfer';

/**
 * T01 — Realizar transferência PIX (DEV-031).
 * Carrega saldo e contatos frequentes; resolve a chave e cria/edita a
 * `PixIntent` ao avançar para T02 (RP-01). Nenhuma senha é solicitada e
 * nenhuma transação é processada aqui.
 */

const router = useRouter();
const store = usePixTransferStore();
const account = ref<AccountResponse | null>(null);

const pixKeyModel = computed({
  get: () => store.pixKey,
  set: (value: string) => store.setPixKey(value),
});

const amountModel = computed({
  get: () => store.amountCents,
  set: (value: number) => {
    store.amountCents = value;
  },
});

const descriptionModel = computed({
  get: () => store.description,
  set: (value: string) => {
    store.description = value;
  },
});

onMounted(async () => {
  account.value = await getAccount();
  await store.loadFrequentRecipients();
});

function selectFrequent(recipient: RecipientResponse) {
  store.selectFrequentRecipient(recipient);
}

async function handleSubmit() {
  const ok = await store.continueToReview();
  if (ok) router.push({ name: 't02' });
}
</script>

<template>
  <AppCard title="Transferir">
    <p v-if="account" class="transferir-view__balance">
      Saldo disponível: <strong>{{ formatCents(account.balanceCents) }}</strong>
    </p>

    <form class="transferir-view__form" @submit.prevent="handleSubmit">
      <AppInput
        v-model="pixKeyModel"
        label="Chave PIX do destinatário"
        autocomplete="off"
      />
      <p v-if="store.recipient" class="transferir-view__selected">
        Destinatário selecionado: {{ store.recipient.name }} ({{
          store.recipient.pixKeyMasked
        }})
      </p>

      <AppCurrencyInput v-model="amountModel" label="Valor (R$)" />

      <AppInput
        v-model="descriptionModel"
        label="Descrição (opcional)"
        autocomplete="off"
      />

      <p v-if="store.errorMessage" class="transferir-view__error" role="alert">
        {{ store.errorMessage }}
      </p>

      <AppButton type="submit" :disabled="store.submitting">
        {{ store.submitting ? 'Continuando…' : 'Continuar' }}
      </AppButton>
    </form>

    <section
      v-if="store.frequentRecipients.length > 0"
      class="transferir-view__frequent"
    >
      <h3 class="transferir-view__frequent-title">Contatos frequentes</h3>
      <ul class="transferir-view__frequent-list">
        <li
          v-for="recipient in store.frequentRecipients"
          :key="recipient.recipientId"
        >
          <button
            type="button"
            class="transferir-view__frequent-item"
            @click="selectFrequent(recipient)"
          >
            <span>{{ recipient.name }}</span>
            <span class="transferir-view__frequent-key">{{
              recipient.pixKeyMasked
            }}</span>
          </button>
        </li>
      </ul>
    </section>
  </AppCard>
</template>

<style scoped>
.transferir-view__balance {
  color: var(--color-text-secondary);
}

.transferir-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  max-width: 24rem;
}

.transferir-view__selected {
  margin-top: calc(var(--spacing-xs) * -1);
  font-size: var(--font-body-sm-size);
  color: var(--color-success);
}

.transferir-view__error {
  font-size: var(--font-body-sm-size);
  color: var(--color-error);
}

.transferir-view__frequent-title {
  font-size: var(--font-headline-sm-size);
  margin-bottom: var(--spacing-sm);
}

.transferir-view__frequent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.transferir-view__frequent-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background-color: var(--color-surface-card);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-body-sm-size);
  color: var(--color-text);
}

.transferir-view__frequent-item:hover {
  background-color: var(--color-surface);
}

.transferir-view__frequent-key {
  color: var(--color-text-secondary);
}
</style>
