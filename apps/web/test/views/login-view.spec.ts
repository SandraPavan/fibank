import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createFinBankRouter } from '../../src/router';
import LoginView from '../../src/views/LoginView.vue';

describe('LoginView', () => {
  it('exibe rótulos em português e navega para T01 ao enviar', async () => {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(LoginView, {
      global: { plugins: [router] },
    });

    expect(wrapper.text()).toContain('Entrar');
    expect(wrapper.find('label').text()).toBe('E-mail');

    // `router.isReady()` só aguarda a navegação inicial; a navegação
    // disparada pelo submit precisa ser esperada via flushPromises.
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });
});
