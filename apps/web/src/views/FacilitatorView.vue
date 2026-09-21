<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import AppInput from '../components/AppInput.vue';
import { useFacilitatorStore } from '../stores/facilitator';

/**
 * Painel do facilitador (DEV-104). Rota isolada (`/facilitator`), sem link
 * em nenhuma tela de participante — dev/02-arquitetura.md: "rota separada,
 * não vinculada na interface dos participantes". Só leitura: nenhuma ação
 * de criar/resetar/aplicar cenário fica aqui, isso continua exclusivo da
 * API/CLI (DEV-004) — aceite: "não executa comandos nem revela falhas
 * reservadas".
 *
 * Cenários de simulação (DEV-040) são restritos ao workspace padrão
 * (`simulation.service.ts`) e nunca chegam a um grupo criado pelo
 * facilitador — por isso este painel não tenta mostrar "cenário
 * reproduzido" por grupo: seria uma métrica que nunca teria valor real
 * com o backend como está. A limitação é declarada na tela, não escondida.
 */

const POLL_INTERVAL_MS = 8000;

const store = useFacilitatorStore();
const secretInput = ref('');
let pollTimer: ReturnType<typeof setInterval> | undefined;

function stopPolling() {
  if (pollTimer !== undefined) clearInterval(pollTimer);
  pollTimer = undefined;
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => store.refresh(), POLL_INTERVAL_MS);
}

async function resumeSession() {
  await store.refresh();
  startPolling();
}

async function handleLogin() {
  const ok = await store.authenticate(secretInput.value);
  secretInput.value = '';
  if (ok) await resumeSession();
}

function handleLogout() {
  stopPolling();
  store.logout();
}

// `refresh()` também desloga sozinho quando o segredo passa a ser inválido
// (polling detecta em segundo plano) — para o timer nesse caso também.
watch(
  () => store.isAuthenticated,
  (authenticated) => {
    if (!authenticated) stopPolling();
  },
);

// REVIEW (DEV-104): o store Pinia sobrevive a navegações dentro da SPA —
// remontar esta view já autenticada (ex.: voltar de outra rota) não passa
// por `handleLogin`. Sem isto, o painel ficava parado (sem refresh nem
// polling) até um logout/login manual, contradizendo o "tempo real".
onMounted(() => {
  if (store.isAuthenticated) resumeSession();
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <div class="facilitator-view">
    <AppCard
      v-if="!store.isAuthenticated"
      title="Painel do facilitador"
      class="facilitator-view__card"
    >
      <form class="facilitator-view__form" @submit.prevent="handleLogin">
        <AppInput
          v-model="secretInput"
          label="Segredo do facilitador"
          type="password"
          autocomplete="off"
          :error-message="store.authError ?? undefined"
        />
        <AppButton
          type="submit"
          :disabled="store.authenticating || !secretInput"
        >
          {{ store.authenticating ? 'Verificando…' : 'Entrar' }}
        </AppButton>
      </form>
    </AppCard>

    <AppCard v-else title="Painel do facilitador" class="facilitator-view__card">
      <div class="facilitator-view__header">
        <p class="facilitator-view__subtitle">
          Dados agregados por grupo, sem detalhe individual de participante.
        </p>
        <AppButton variant="secondary" @click="handleLogout">Sair</AppButton>
      </div>

      <p v-if="store.loadError" class="facilitator-view__error" role="alert">
        {{ store.loadError }}
      </p>

      <p v-if="store.loading && store.workspaces.length === 0">
        Carregando grupos…
      </p>
      <p v-else-if="store.workspaces.length === 0">
        Nenhum grupo criado ainda.
      </p>

      <ul v-else class="facilitator-view__list">
        <li
          v-for="workspace in store.workspaces"
          :key="workspace.workspaceId"
          class="facilitator-view__item"
        >
          <h3 class="facilitator-view__item-title">{{ workspace.groupSlug }}</h3>
          <dl v-if="workspace.metrics" class="facilitator-view__metrics">
            <div>
              <dt>Aprovadas</dt>
              <dd>{{ workspace.metrics.approved }}</dd>
            </div>
            <div>
              <dt>Em análise</dt>
              <dd>{{ workspace.metrics.review }}</dd>
            </div>
            <div>
              <dt>Em análise há mais de 24h</dt>
              <dd>{{ workspace.metrics.reviewSlaBreached }}</dd>
            </div>
            <div>
              <dt>Rejeitadas</dt>
              <dd>{{ workspace.metrics.rejected }}</dd>
            </div>
            <div>
              <dt>Falhas</dt>
              <dd>{{ workspace.metrics.failed }}</dd>
            </div>
          </dl>
          <p v-else class="facilitator-view__item-error">
            {{ workspace.metricsError }}
          </p>
        </li>
      </ul>

      <p class="facilitator-view__note">
        Cenários de simulação são restritos ao ambiente padrão e não se
        aplicam a grupos individuais — este painel não mostra essa métrica
        por grupo.
      </p>
    </AppCard>
  </div>
</template>

<style scoped>
.facilitator-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-mobile-margin);
  background-color: var(--color-surface);
}

.facilitator-view__card {
  width: 100%;
  max-width: 40rem;
}

.facilitator-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.facilitator-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.facilitator-view__subtitle {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}

.facilitator-view__error {
  color: var(--color-error);
  font-size: var(--font-body-sm-size);
}

.facilitator-view__list {
  display: grid;
  gap: var(--spacing-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

.facilitator-view__item {
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background-color: var(--color-surface);
}

.facilitator-view__item-title {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-body-md-size);
}

.facilitator-view__item-error {
  color: var(--color-error);
  font-size: var(--font-body-sm-size);
}

.facilitator-view__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--spacing-sm);
  margin: 0;
}

.facilitator-view__metrics dt {
  font-size: var(--font-label-md-size);
  font-weight: var(--font-label-md-weight);
  letter-spacing: var(--font-label-md-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.facilitator-view__metrics dd {
  margin: 0;
  font-size: var(--font-body-md-size);
  font-weight: 600;
}

.facilitator-view__note {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}
</style>
