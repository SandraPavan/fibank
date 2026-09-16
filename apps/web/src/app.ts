import { createPinia, type Pinia } from 'pinia';
import { createApp } from 'vue';
import type { Router } from 'vue-router';
import App from './App.vue';
import { createFinBankRouter } from './router';

export interface FinBankAppOptions {
  readonly pinia?: Pinia;
  readonly router?: Router;
}

export function createFinBankApp(options: FinBankAppOptions = {}) {
  const pinia = options.pinia ?? createPinia();
  const router = options.router ?? createFinBankRouter();

  return createApp(App).use(pinia).use(router);
}
