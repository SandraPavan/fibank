<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { JoinSessionResponse } from '@finbank/contracts';
import { apiPost, ApiError } from '../api/http';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';

/**
 * `/join/:groupSlug?code=...` (DEV-004): autentica a sessão do grupo e grava
 * o cookie; em seguida troca a rota para `/login` sem o código na URL —
 * `router.replace` descarta a entrada com `?code=` do histórico.
 */

const route = useRoute();
const router = useRouter();
const failed = ref(false);

onMounted(async () => {
  const groupSlug = String(route.params.groupSlug ?? '');
  const code = String(route.query.code ?? '');
  try {
    await apiPost<JoinSessionResponse>('/sessions/join', { groupSlug, code });
    await router.replace({ name: 'login' });
  } catch (error) {
    failed.value = true;
    if (!(error instanceof ApiError)) throw error;
  }
});
</script>

<template>
  <div class="join-view">
    <AppCard title="Entrando no grupo" class="join-view__card">
      <p v-if="!failed" class="join-view__message">
        Confirmando o link de acesso do grupo...
      </p>
      <template v-else>
        <p class="join-view__message">
          Não foi possível confirmar este link. Verifique o link com o
          facilitador.
        </p>
        <AppButton class="join-view__retry" @click="router.go(0)">
          Tentar novamente
        </AppButton>
      </template>
    </AppCard>
  </div>
</template>

<style scoped>
.join-view {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-mobile-margin);
  background-color: var(--color-surface);
}

.join-view__card {
  width: 100%;
  max-width: 24rem;
}

.join-view__message {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}

.join-view__retry {
  width: 100%;
}
</style>
