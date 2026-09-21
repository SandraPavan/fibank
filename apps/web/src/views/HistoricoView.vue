<script setup lang="ts">
import type { TransactionPageResponse } from '@finbank/contracts';
import { computed, onMounted, ref } from 'vue';
import { listTransactions, type TransactionListQuery } from '../api/banking';
import { ApiError } from '../api/http';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import AppInput from '../components/AppInput.vue';
import StatusPill from '../components/StatusPill.vue';
import { formatCents } from '../lib/currency';
import { findPossibleDuplicates } from '../lib/transactionAnomalies';

/**
 * T06 — Histórico de transações (DEV-034/DEV-103).
 *
 * Filtros e paginação espelham `GET /transactions` (RP-09). Duplicidade e
 * revisão antiga são sinalizadas com ícone + texto, nunca só por cor
 * (RNF-07) — `StatusPill` cobre o status base. Duplicidade continua sendo
 * um sinal só visual, calculado aqui (dev/07-dados-e-cenarios.md); revisão
 * antiga (F07) vem pronta da API (`item.slaBreached`, DEV-103).
 *
 * Preservar: sem ações que mudem o estado de uma transação
 * (cancelar/revisar) — o contrato atual não tem esse endpoint.
 */

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'REVIEW', label: 'Em análise' },
  { value: 'REJECTED', label: 'Rejeitada' },
  { value: 'FAILED', label: 'Falha' },
] as const;

const search = ref('');
const status = ref<'' | 'APPROVED' | 'REVIEW' | 'REJECTED' | 'FAILED'>('');
const type = ref<'' | 'PIX'>('');
const from = ref('');
const to = ref('');
const page = ref(1);

const pageResult = ref<TransactionPageResponse | null>(null);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

const items = computed(() => pageResult.value?.items ?? []);
const staleReviewIds = computed(
  () =>
    new Set(
      items.value.filter((item) => item.slaBreached).map((item) => item.transactionId),
    ),
);
const duplicateIds = computed(() => findPossibleDuplicates(items.value));
const attentionIds = computed(() => {
  const combined = new Set<string>(staleReviewIds.value);
  for (const id of duplicateIds.value) combined.add(id);
  for (const item of items.value) {
    if (item.status === 'FAILED' || item.status === 'REJECTED') {
      combined.add(item.transactionId);
    }
  }
  return combined;
});

function statusVariant(
  itemStatus: TransactionPageResponse['items'][number]['status'],
): 'success' | 'warning' | 'error' {
  if (itemStatus === 'APPROVED') return 'success';
  if (itemStatus === 'REVIEW') return 'warning';
  return 'error';
}

function statusLabel(
  itemStatus: TransactionPageResponse['items'][number]['status'],
): string {
  return (
    STATUS_OPTIONS.find((option) => option.value === itemStatus)?.label ??
    itemStatus
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

async function loadPage(targetPage: number) {
  loading.value = true;
  errorMessage.value = null;
  try {
    const query: TransactionListQuery = {
      page: targetPage,
      pageSize: 20,
      search: search.value.trim() || undefined,
      status: status.value || undefined,
      type: type.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
    };
    pageResult.value = await listTransactions(query);
    page.value = targetPage;
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError
        ? error.problem.detail || error.problem.title
        : 'Não foi possível carregar o histórico. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  loadPage(1);
}

function clearFilters() {
  search.value = '';
  status.value = '';
  type.value = '';
  from.value = '';
  to.value = '';
  loadPage(1);
}

function goToPreviousPage() {
  if (page.value > 1) loadPage(page.value - 1);
}

function goToNextPage() {
  if (pageResult.value && page.value < pageResult.value.totalPages) {
    loadPage(page.value + 1);
  }
}

onMounted(() => {
  loadPage(1);
});
</script>

<template>
  <AppCard title="Histórico de transações">
    <output v-if="attentionIds.size > 0" class="historico-view__attention">
      <span aria-hidden="true">⚠</span>
      <span>{{ attentionIds.size }} item(ns) exigem atenção nesta página.</span>
    </output>

    <form class="historico-view__filters" @submit.prevent="applyFilters">
      <AppInput
        v-model="search"
        label="Buscar (ID ou contraparte)"
        autocomplete="off"
      />

      <div class="historico-view__field">
        <label class="historico-view__label" for="historico-status"
          >Status</label
        >
        <select
          id="historico-status"
          v-model="status"
          class="historico-view__select"
        >
          <option
            v-for="option in STATUS_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="historico-view__field">
        <label class="historico-view__label" for="historico-type">Tipo</label>
        <select
          id="historico-type"
          v-model="type"
          class="historico-view__select"
        >
          <option value="">Todos os tipos</option>
          <option value="PIX">PIX</option>
        </select>
      </div>

      <div class="historico-view__field">
        <label class="historico-view__label" for="historico-from">De</label>
        <input
          id="historico-from"
          v-model="from"
          class="historico-view__select"
          type="date"
        />
      </div>

      <div class="historico-view__field">
        <label class="historico-view__label" for="historico-to">Até</label>
        <input
          id="historico-to"
          v-model="to"
          class="historico-view__select"
          type="date"
        />
      </div>

      <div class="historico-view__filter-actions">
        <AppButton variant="secondary" type="button" @click="clearFilters">
          Limpar filtros
        </AppButton>
        <AppButton type="submit"> Aplicar filtros </AppButton>
      </div>
    </form>

    <p v-if="errorMessage" class="historico-view__error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-else-if="loading">Carregando histórico…</p>
    <p v-else-if="items.length === 0">Nenhuma transação encontrada.</p>

    <ul v-else class="historico-view__list">
      <li
        v-for="item in items"
        :key="item.transactionId"
        class="historico-view__row"
      >
        <div class="historico-view__row-main">
          <span class="historico-view__recipient">{{
            item.recipientSnapshot.name
          }}</span>
          <span class="historico-view__date">{{
            formatDate(item.createdAt)
          }}</span>
        </div>
        <div class="historico-view__row-details">
          <span class="historico-view__amount">{{
            formatCents(item.amountCents)
          }}</span>
          <StatusPill
            :status="statusVariant(item.status)"
            :label="statusLabel(item.status)"
          />
          <span
            v-if="staleReviewIds.has(item.transactionId)"
            class="historico-view__badge"
          >
            ⏱ Em análise há mais de 24h
          </span>
          <span
            v-if="duplicateIds.has(item.transactionId)"
            class="historico-view__badge"
          >
            ⚠ Possível duplicidade
          </span>
        </div>
        <span class="historico-view__id">{{ item.transactionId }}</span>
      </li>
    </ul>

    <div v-if="pageResult" class="historico-view__pagination">
      <AppButton
        variant="secondary"
        :disabled="page <= 1"
        @click="goToPreviousPage"
      >
        Anterior
      </AppButton>
      <span
        >Página {{ pageResult.page }} de
        {{ Math.max(pageResult.totalPages, 1) }}</span
      >
      <AppButton
        variant="secondary"
        :disabled="page >= pageResult.totalPages"
        @click="goToNextPage"
      >
        Próxima
      </AppButton>
    </div>
  </AppCard>
</template>

<style scoped>
.historico-view__attention {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-card);
  background-color: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: var(--font-body-sm-size);
}

.historico-view__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--spacing-md);
  align-items: end;
}

.historico-view__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.historico-view__label {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.historico-view__select {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-input);
  background-color: var(--color-surface-card);
  color: var(--color-text);
  font-size: var(--font-body-md-size);
}

.historico-view__filter-actions {
  display: flex;
  gap: var(--spacing-sm);
  grid-column: 1 / -1;
}

.historico-view__error {
  color: var(--color-error);
}

.historico-view__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.historico-view__row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface-card);
}

.historico-view__row-main {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.historico-view__date {
  font-weight: 400;
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}

.historico-view__row-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
}

.historico-view__amount {
  font-weight: 600;
}

.historico-view__badge {
  font-size: var(--font-body-sm-size);
  color: var(--color-warning);
}

.historico-view__id {
  font-size: var(--font-body-sm-size);
  color: var(--color-text-secondary);
}

.historico-view__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
}
</style>
