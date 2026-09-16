<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import { usePixTransferStore } from '../stores/pixTransfer';

/**
 * T05 — Erro na transação (DEV-033).
 *
 * Tela genérica para quando T03 não recebe um resultado interpretável
 * (timeout/falha de rede — `confirmOutcome === 'unknown-result'`, ver
 * `stores/pixTransfer.ts`). RF-06: timeout nunca é apresentado como
 * rejeição definitiva, por isso a mensagem não afirma que a transação
 * falhou — só que o resultado não pôde ser confirmado a tempo.
 *
 * RP-08 ("Ver detalhes do erro"): mostra um código de referência e o
 * estado conhecido pelo cliente, sem regras internas de antifraude.
 *
 * Preservar (DEV-033): "Tentar novamente" só volta a T03 para uma nova
 * tentativa — não consulta o `requestId` original antes de reabrir o
 * formulário. Reconciliar automaticamente é comportamento-alvo (RP-07,
 * DEV-102, bloqueado), não do baseline.
 */

const router = useRouter();
const store = usePixTransferStore();
const showDetails = ref(false);

function handleRetry() {
  router.push({ name: 't03' });
}

function handleBack() {
  router.push({ name: 't01' });
}
</script>

<template>
  <AppCard title="Erro na transação">
    <p class="erro-view__message">
      Não foi possível confirmar o resultado desta transação. Isso não significa
      que ela foi recusada.
    </p>

    <button
      type="button"
      class="erro-view__toggle"
      :aria-expanded="showDetails"
      @click="showDetails = !showDetails"
    >
      {{ showDetails ? 'Ocultar detalhes do erro' : 'Ver detalhes do erro' }}
    </button>

    <dl v-if="showDetails" class="erro-view__details">
      <div>
        <dt>Código de referência</dt>
        <dd>{{ store.requestId ?? 'não disponível' }}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>Resultado desconhecido</dd>
      </div>
      <div v-if="store.confirmError">
        <dt>Mensagem</dt>
        <dd>{{ store.confirmError }}</dd>
      </div>
      <div>
        <dt>Próxima ação segura</dt>
        <dd>
          Tentar novamente ou consultar o histórico antes de repetir o
          pagamento.
        </dd>
      </div>
    </dl>

    <div class="erro-view__actions">
      <AppButton variant="secondary" @click="handleBack"> Voltar </AppButton>
      <AppButton @click="handleRetry"> Tentar novamente </AppButton>
    </div>
  </AppCard>
</template>

<style scoped>
.erro-view__message {
  color: var(--color-text-secondary);
}

.erro-view__toggle {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary);
  font-size: var(--font-body-sm-size);
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.erro-view__details {
  display: grid;
  gap: var(--spacing-sm);
  margin: 0;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface);
}

.erro-view__details dt {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.erro-view__details dd {
  margin: 0;
  font-size: var(--font-body-sm-size);
}

.erro-view__actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}
</style>
