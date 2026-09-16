<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import { formatCents } from '../lib/currency';
import { usePixTransferStore } from '../stores/pixTransfer';

/**
 * T02 — Revisar e confirmar PIX (DEV-031).
 * Mostra o snapshot do destinatário já resolvido em T01. "Editar Dados"
 * volta a T01 preservando os dados (RP-02); "Confirmar e Pagar" só
 * navega para T03 — nenhuma senha é pedida e nenhum PIX é processado
 * aqui (isso é DEV-032).
 */

const router = useRouter();
const store = usePixTransferStore();

onMounted(() => {
  // Acesso direto sem passar por T01 (ex.: recarregar a página) não tem
  // destinatário resolvido: volta para o formulário.
  if (!store.recipient || !store.requestId) {
    router.replace({ name: 't01' });
  }
});

function handleEdit() {
  router.push({ name: 't01' });
}

function handleConfirm() {
  router.push({ name: 't03' });
}
</script>

<template>
  <AppCard v-if="store.recipient" title="Revisar e confirmar">
    <dl class="revisar-view__details">
      <div>
        <dt>Nome</dt>
        <dd>{{ store.recipient.name }}</dd>
      </div>
      <div>
        <dt>Instituição</dt>
        <dd>{{ store.recipient.institution }}</dd>
      </div>
      <div>
        <dt>Documento</dt>
        <dd>{{ store.recipient.documentMasked }}</dd>
      </div>
      <div>
        <dt>Chave PIX</dt>
        <dd>{{ store.recipient.pixKeyMasked }}</dd>
      </div>
      <div>
        <dt>Valor a transferir</dt>
        <dd>{{ formatCents(store.amountCents) }}</dd>
      </div>
      <div v-if="store.description">
        <dt>Descrição</dt>
        <dd>{{ store.description }}</dd>
      </div>
    </dl>

    <p class="revisar-view__notice">
      Ao confirmar, o valor será transferido imediatamente. Verifique
      cuidadosamente os dados do destinatário.
    </p>

    <div class="revisar-view__actions">
      <AppButton variant="secondary" @click="handleEdit">
        Editar dados
      </AppButton>
      <AppButton @click="handleConfirm"> Confirmar e pagar </AppButton>
    </div>
  </AppCard>
</template>

<style scoped>
.revisar-view__details {
  display: grid;
  gap: var(--spacing-md);
  margin: 0;
}

.revisar-view__details dt {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.revisar-view__details dd {
  margin: 0;
  font-size: var(--font-body-md-size);
}

.revisar-view__notice {
  padding: var(--spacing-md);
  border-radius: var(--radius-input);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: var(--font-body-sm-size);
  color: var(--color-text-secondary);
}

.revisar-view__actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}
</style>
