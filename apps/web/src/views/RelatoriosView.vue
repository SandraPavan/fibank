<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  getAllReportSuiteStates,
  getReportLog,
  type ReportStatus,
  type ReportSuite,
} from '../api/reports';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import StatusPill from '../components/StatusPill.vue';

/**
 * Relatórios públicos de teste (DEV-003), acessíveis dentro do app em vez
 * de só pela URL estática `/reports/`. Somente leitura, comum a todos os
 * grupos (DEV-004) — não depende de perfil nem de workspace selecionado.
 */

const suites = ref<readonly ReportSuite[]>([]);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

// Painel expansível de log: uma suíte aberta por vez, carregada sob
// demanda (só busca o log quando a pessoa clica em "Ver cenários
// testados"), sem manter tudo em memória de saída.
const expandedSlug = ref<string | null>(null);
const logText = ref<string | null>(null);
const logLoading = ref(false);

const MAX_LOG_CHARS = 8000;

function truncateLog(text: string): string {
  if (text.length <= MAX_LOG_CHARS) return text;
  return `${text.slice(0, MAX_LOG_CHARS)}\n\n… conteúdo truncado — baixe o arquivo completo para ver tudo.`;
}

/** Cada suíte gera exatamente um resultado hoje (scripts/test-reports.mjs). */
function firstResultName(suite: ReportSuite): string | undefined {
  return suite.state.kind === 'summary'
    ? suite.state.summary.results[0]?.name
    : undefined;
}

async function toggleLog(suite: ReportSuite) {
  if (expandedSlug.value === suite.slug) {
    expandedSlug.value = null;
    return;
  }
  expandedSlug.value = suite.slug;
  logText.value = null;
  const resultName = firstResultName(suite);
  if (!resultName) return;
  logLoading.value = true;
  const text = await getReportLog(suite.slug, resultName);
  logText.value = text !== null ? truncateLog(text) : null;
  logLoading.value = false;
}

const failingCount = computed(
  () =>
    suites.value.filter(
      (suite) =>
        suite.state.kind === 'summary' &&
        suite.state.summary.status === 'falhou',
    ).length,
);

function pillVariant(status: ReportStatus): 'success' | 'warning' | 'error' {
  if (status === 'aprovado') return 'success';
  if (status === 'em execução') return 'warning';
  return 'error';
}

function pillLabel(status: ReportStatus): string {
  return {
    aprovado: 'Aprovado',
    falhou: 'Falhou',
    'em execução': 'Em execução',
  }[status];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

async function loadReports() {
  loading.value = true;
  errorMessage.value = null;
  try {
    const result = await getAllReportSuiteStates();
    if (result.every((suite) => suite.state.kind === 'error')) {
      errorMessage.value =
        'Não foi possível carregar os relatórios de teste. Tente novamente.';
      suites.value = [];
    } else {
      suites.value = result;
    }
  } catch {
    errorMessage.value =
      'Não foi possível carregar os relatórios de teste. Tente novamente.';
    suites.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadReports();
});
</script>

<template>
  <AppCard title="Relatórios de testes">
    <output v-if="failingCount > 0" class="relatorios-view__attention">
      <span aria-hidden="true">⚠</span>
      <span>{{ failingCount }} suíte(s) com falha.</span>
    </output>

    <div class="relatorios-view__toolbar">
      <a
        href="/reports/index.html"
        target="_blank"
        rel="noopener"
        class="relatorios-view__index-link"
      >
        Ver índice completo (gerado)
      </a>
      <AppButton variant="secondary" type="button" @click="loadReports">
        Atualizar
      </AppButton>
    </div>

    <p v-if="errorMessage" class="relatorios-view__error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-else-if="loading">Carregando relatórios…</p>

    <ul v-else class="relatorios-view__list">
      <li
        v-for="suite in suites"
        :key="suite.slug"
        class="relatorios-view__row"
      >
        <div class="relatorios-view__row-main">
          <span class="relatorios-view__label">{{ suite.label }}</span>
          <StatusPill
            v-if="suite.state.kind === 'summary'"
            :status="pillVariant(suite.state.summary.status)"
            :label="pillLabel(suite.state.summary.status)"
          />
          <span
            v-else-if="suite.state.kind === 'not-run'"
            class="relatorios-view__badge-muted"
          >
            ◌ Não executado
          </span>
          <span v-else class="relatorios-view__badge-muted">
            ✕ Indisponível
          </span>
        </div>
        <div
          v-if="suite.state.kind === 'summary'"
          class="relatorios-view__row-details"
        >
          <span class="relatorios-view__date">
            Início: {{ formatDate(suite.state.summary.startedAt) }}
          </span>
          <template v-if="firstResultName(suite)">
            <AppButton
              variant="secondary"
              type="button"
              @click="toggleLog(suite)"
            >
              {{
                expandedSlug === suite.slug
                  ? 'Ocultar cenários testados'
                  : 'Ver cenários testados'
              }}
            </AppButton>
            <a
              :href="`/reports/${suite.slug}/${firstResultName(suite)}.log`"
              download
            >
              Baixar
            </a>
          </template>
        </div>
        <div
          v-if="expandedSlug === suite.slug"
          class="relatorios-view__log-panel"
        >
          <p v-if="logLoading">Carregando…</p>
          <pre v-else-if="logText" class="relatorios-view__log">{{
            logText
          }}</pre>
          <p v-else class="relatorios-view__error" role="alert">
            Não foi possível carregar o log desta suíte.
          </p>
        </div>
      </li>
    </ul>
  </AppCard>
</template>

<style scoped>
.relatorios-view__attention {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-card);
  background-color: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: var(--font-body-sm-size);
  margin-bottom: var(--spacing-md);
}

.relatorios-view__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.relatorios-view__index-link {
  font-size: var(--font-body-sm-size);
  color: var(--color-text-secondary);
}

.relatorios-view__error {
  color: var(--color-error);
}

.relatorios-view__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.relatorios-view__row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface-card);
}

.relatorios-view__row-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  font-weight: 600;
}

.relatorios-view__badge-muted {
  font-size: var(--font-label-md-size);
  color: var(--color-text-secondary);
}

.relatorios-view__row-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-body-sm-size);
}

.relatorios-view__date {
  color: var(--color-text-secondary);
}

.relatorios-view__log-panel {
  margin-top: var(--spacing-xs);
}

.relatorios-view__log {
  max-height: 20rem;
  overflow-y: auto;
  margin: 0;
  padding: var(--spacing-md);
  border-radius: var(--radius-input);
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: ui-monospace, monospace;
  font-size: var(--font-body-sm-size);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>
