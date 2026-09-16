import { createPinia, getActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createFinBankApp } from '../src/app';
import { createFinBankRouter } from '../src/router';

describe('App', () => {
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    container?.remove();
  });

  it('monta o shell pela factory com Router e Pinia registrados', async () => {
    const pinia = createPinia();
    const router = createFinBankRouter(createMemoryHistory());
    const app = createFinBankApp({ pinia, router });
    container = document.createElement('div');
    document.body.append(container);

    await router.push('/');
    await router.isReady();
    app.mount(container);

    expect(router.currentRoute.value.path).toBe('/login');
    expect(container.querySelector('h2')?.textContent).toBe('Entrar');
    expect(app.config.globalProperties.$router).toBe(router);
    expect(getActivePinia()).toBe(pinia);

    app.unmount();
  });
});
