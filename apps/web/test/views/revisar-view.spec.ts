import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { createFinBankRouter } from '../../src/router';
import { usePixTransferStore } from '../../src/stores/pixTransfer';
import RevisarView from '../../src/views/RevisarView.vue';

vi.mock('../../src/api/banking');

const recipient = {
  recipientId: 'rec-1',
  name: 'Maria Silva',
  pixKeyMasked: 'm***@e***.com',
  documentMasked: '***.456.789-**',
  institution: 'FinBank',
};

async function mountView() {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push('/app/revisar');
  await router.isReady();

  const wrapper = mount(RevisarView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('RevisarView (T02)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('redireciona para T01 quando não há destinatário resolvido (acesso direto)', async () => {
    const { router } = await mountView();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });

  it('exibe os dados mascarados do destinatário e o valor revisado', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 150000;
    store.requestId = 'req-1';

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Maria Silva');
    expect(wrapper.text()).toContain('m***@e***.com');
    expect(wrapper.text()).toContain('***.456.789-**');
    expect(wrapper.text()).toContain('R$');
  });

  it('"Editar dados" volta para T01 preservando os dados no store (RP-02)', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 150000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Editar dados')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
    expect(store.recipient).toEqual(recipient);
    expect(store.amountCents).toBe(150000);
  });

  it('"Confirmar e pagar" navega para T03 sem chamar a API de confirmação', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 150000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirmar e pagar')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/senha');
    // T02 nunca processa o PIX — a confirmação é exclusiva de T03/DEV-032.
    expect(banking.confirmPixIntent).not.toHaveBeenCalled();
  });
});
