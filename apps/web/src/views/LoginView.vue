<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/AppButton.vue';
import AppCard from '../components/AppCard.vue';
import AppInput from '../components/AppInput.vue';

/**
 * Login fictício (DEV-030): a tela e o design system são o escopo desta
 * história. `POST /auth/login` ainda não existe no backend (fora do
 * escopo de DEV-010/011/012/020), então o envio apenas navega para a
 * primeira tela do fluxo PIX (T01), sem chamada de API.
 */

const router = useRouter();
const email = ref('');
const password = ref('');

function handleSubmit() {
  router.push({ name: 't01' });
}
</script>

<template>
  <div class="login-view">
    <AppCard title="Entrar" class="login-view__card">
      <p class="login-view__subtitle">FinBank PIX Seguro</p>
      <form class="login-view__form" @submit.prevent="handleSubmit">
        <AppInput
          v-model="email"
          label="E-mail"
          type="email"
          autocomplete="username"
        />
        <AppInput
          v-model="password"
          label="Senha"
          type="password"
          autocomplete="current-password"
        />
        <AppButton type="submit" class="login-view__submit"> Entrar </AppButton>
      </form>
    </AppCard>
    <p class="login-view__footer">© 2026 FinBank</p>
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-mobile-margin);
  background-color: var(--color-surface);
}

.login-view__card {
  width: 100%;
  max-width: 24rem;
}

.login-view__subtitle {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}

.login-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.login-view__submit {
  width: 100%;
}

.login-view__footer {
  color: var(--color-text-secondary);
  font-size: var(--font-body-sm-size);
}
</style>
