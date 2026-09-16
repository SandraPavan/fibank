<script setup lang="ts">
import type { TransactionResponse } from '@finbank/contracts';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getTransaction } from '../api/banking';
import AppCard from '../components/AppCard.vue';
import { formatCents } from '../lib/currency';

/**
 * T04 — Comprovante (DEV-033).
 *
 * Busca sempre pela API, pelo `transactionId` da rota — funciona também
 * ao recarregar a página ou abrir o link diretamente (F01: "T04 carrega
 * o comprovante pelo transactionId"), sem depender do store de T01/T02.
 *
 * RP-05: só renderiza para `APPROVED`. Qualquer outro status, ou falha
 * ao buscar (ex.: transação inexistente), leva a T05 — o comprovante
 * nunca é gerado para uma operação que não está claramente concluída.
 */

const props = defineProps<{ transactionId: string }>();
const router = useRouter();
const transaction = ref<TransactionResponse | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const result = await getTransaction(props.transactionId);
    if (result.status !== 'APPROVED') {
      router.replace({ name: 't05' });
      return;
    }
    transaction.value = result;
  } catch {
    router.replace({ name: 't05' });
  } finally {
    loading.value = false;
  }
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}
</script>

<template>
  <AppCard v-if="transaction" title="Comprovante">
    <dl class="comprovante-view__details">
      <div>
        <dt>Favorecido</dt>
        <dd>{{ transaction.recipientSnapshot.name }}</dd>
      </div>
      <div>
        <dt>Instituição</dt>
        <dd>{{ transaction.recipientSnapshot.institution }}</dd>
      </div>
      <div>
        <dt>Chave PIX</dt>
        <dd>{{ transaction.recipientSnapshot.pixKeyMasked }}</dd>
      </div>
      <div>
        <dt>Valor</dt>
        <dd>{{ formatCents(transaction.amountCents) }}</dd>
      </div>
      <div>
        <dt>Data e hora</dt>
        <dd>{{ formatDate(transaction.processedAt) }}</dd>
      </div>
      <div>
        <dt>Identificador</dt>
        <dd>{{ transaction.transactionId }}</dd>
      </div>
      <div v-if="transaction.description">
        <dt>Descrição</dt>
        <dd>{{ transaction.description }}</dd>
      </div>
    </dl>
  </AppCard>
  <AppCard v-else-if="loading" title="Comprovante">
    <p>Carregando comprovante…</p>
  </AppCard>
</template>

<style scoped>
.comprovante-view__details {
  display: grid;
  gap: var(--spacing-md);
  margin: 0;
}

.comprovante-view__details dt {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.comprovante-view__details dd {
  margin: 0;
  font-size: var(--font-body-md-size);
}
</style>
