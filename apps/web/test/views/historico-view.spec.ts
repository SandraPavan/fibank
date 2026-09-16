import type { TransactionResponse } from '@finbank/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { createFinBankRouter } from '../../src/router';
import HistoricoView from '../../src/views/HistoricoView.vue';

vi.mock('../../src/api/banking');

const recipientA = {
  recipientId: 'rec-1',
  name: 'Maria Silva',
  pixKeyMasked: 'm***@e***.com',
  documentMasked: '***.456.789-**',
  institution: 'FinBank',
};
const recipientB = {
  recipientId: 'rec-2',
  name: 'João Souza',
  pixKeyMasked: 'j***@e***.com',
  documentMasked: '***.111.222-**',
  institution: 'FinBank',
};

function baseTransaction(
  overrides: Partial<TransactionResponse>,
): TransactionResponse {
  return {
    transactionId: 'PIX-0',
    requestId: 'req-0',
    type: 'PIX',
    recipientSnapshot: recipientA,
    amountCents: 100000,
    description: '',
    status: 'APPROVED',
    reasonCodes: [],
    createdAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Os cinco registros previstos por F08 (dev/04-fluxos.md). */
function seedFiveRecords(): TransactionResponse[] {
  const now = Date.now();
  return [
    baseTransaction({ transactionId: 'PIX-APPROVED', status: 'APPROVED' }),
    baseTransaction({
      transactionId: 'PIX-STALE',
      status: 'REVIEW',
      createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    }),
    baseTransaction({
      transactionId: 'PIX-DUP-1',
      recipientSnapshot: recipientB,
      amountCents: 875000,
      createdAt: new Date(now).toISOString(),
    }),
    baseTransaction({
      transactionId: 'PIX-DUP-2',
      requestId: 'req-dup-2',
      recipientSnapshot: recipientB,
      amountCents: 875000,
      createdAt: new Date(now + 30 * 1000).toISOString(),
    }),
    baseTransaction({ transactionId: 'PIX-FAILED', status: 'FAILED' }),
  ];
}

async function mountView() {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push('/app/historico');
  await router.isReady();

  const wrapper = mount(HistoricoView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('HistoricoView (T06)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('carrega e exibe os cinco registros previstos (F08), com anomalias sinalizadas por texto', async () => {
    const items = seedFiveRecords();
    vi.mocked(banking.listTransactions).mockResolvedValue({
      items,
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: 1,
    });

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Maria Silva');
    expect(wrapper.text()).toContain('João Souza');
    // Anomalias identificáveis por texto, não só por cor (RNF-07).
    expect(wrapper.text()).toContain('Em análise há mais de 24h');
    expect(wrapper.text()).toContain('Possível duplicidade');
    expect(wrapper.text()).toContain('Falha');
    expect(wrapper.text()).toMatch(/\d+ item\(ns\) exigem atenção/);
  });

  it('aplica filtro de status ao enviar o formulário', async () => {
    vi.mocked(banking.listTransactions).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    });

    const { wrapper } = await mountView();
    await wrapper.find('#historico-status').setValue('REVIEW');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(banking.listTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'REVIEW', page: 1 }),
    );
  });

  it('paginação: "Próxima" busca a página seguinte e respeita o limite', async () => {
    vi.mocked(banking.listTransactions).mockResolvedValue({
      items: [baseTransaction({ transactionId: 'PIX-1' })],
      page: 1,
      pageSize: 20,
      totalItems: 40,
      totalPages: 2,
    });

    const { wrapper } = await mountView();
    const previousButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Anterior');
    expect(previousButton?.attributes('disabled')).toBeDefined();

    vi.mocked(banking.listTransactions).mockResolvedValue({
      items: [baseTransaction({ transactionId: 'PIX-2' })],
      page: 2,
      pageSize: 20,
      totalItems: 40,
      totalPages: 2,
    });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Próxima')
      ?.trigger('click');
    await flushPromises();

    expect(banking.listTransactions).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    const nextButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Próxima');
    expect(nextButton?.attributes('disabled')).toBeDefined();
  });

  it('mostra mensagem de erro quando a busca falha', async () => {
    vi.mocked(banking.listTransactions).mockRejectedValue(
      new Error('network down'),
    );

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Não foi possível carregar o histórico');
  });
});
