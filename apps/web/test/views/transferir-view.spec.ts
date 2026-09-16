import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { createFinBankRouter } from '../../src/router';
import { usePixTransferStore } from '../../src/stores/pixTransfer';
import TransferirView from '../../src/views/TransferirView.vue';

vi.mock('../../src/api/banking');

const account = {
  accountId: 'acc-1',
  profileId: 'PRO-1001',
  ownerName: 'Maria Silva',
  documentMasked: '***.456.789-**',
  balanceCents: 500000,
  dailyLimitCents: 1000000,
};

const frequent = [
  {
    recipientId: 'rec-1',
    name: 'João Souza',
    pixKeyMasked: 'j***@e***.com',
    documentMasked: '***.111.222-**',
    institution: 'FinBank',
  },
];

describe('TransferirView (T01)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(banking.getAccount).mockResolvedValue(account);
    vi.mocked(banking.getFrequentRecipients).mockResolvedValue(frequent);
  });

  async function mountView() {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push('/app/transferir');
    await router.isReady();

    const wrapper = mount(TransferirView, { global: { plugins: [router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('carrega e exibe o saldo e os contatos frequentes', async () => {
    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('R$');
    expect(wrapper.text()).toContain('João Souza');
  });

  it('selecionar um contato frequente preenche o destinatário sem criar a intenção', async () => {
    const { wrapper } = await mountView();
    const store = usePixTransferStore();

    await wrapper
      .find('button.transferir-view__frequent-item')
      .trigger('click');

    expect(store.recipient?.recipientId).toBe('rec-1');
    expect(banking.createPixIntent).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Destinatário selecionado');
  });

  it('avança para T02 ao continuar com dados válidos', async () => {
    vi.mocked(banking.createPixIntent).mockResolvedValue({
      requestId: 'req-1',
      accountId: 'acc-1',
      recipientId: 'rec-1',
      amountCents: 1000,
      description: '',
      deviceId: 'device-1',
      state: 'DRAFT',
      createdAt: '2026-08-18T14:00:00-03:00',
      expiresAt: '2026-08-18T14:05:00-03:00',
    });

    const { wrapper, router } = await mountView();
    const store = usePixTransferStore();
    store.selectFrequentRecipient(frequent[0]!);
    store.amountCents = 1000;

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/revisar');
  });

  it('exibe a mensagem de erro do store sem avançar quando a validação falha', async () => {
    const { wrapper, router } = await mountView();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Informe um valor maior que zero.');
    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });
});
