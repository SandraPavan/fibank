import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { createFinBankRouter } from '../../src/router';
import { usePixTransferStore } from '../../src/stores/pixTransfer';
import ErroView from '../../src/views/ErroView.vue';

vi.mock('../../src/api/banking');

async function mountView() {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push('/app/erro');
  await router.isReady();

  const wrapper = mount(ErroView, { global: { plugins: [router] } });
  return { wrapper, router };
}

describe('ErroView (T05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('mostra uma mensagem genérica, sem afirmar que a transação falhou (RF-06)', async () => {
    const { wrapper } = await mountView();

    // RF-06: timeout não é apresentado como rejeição definitiva — a
    // mensagem não pode *afirmar* que a transação falhou/foi recusada
    // (mesmo que mencione a palavra ao negar essa possibilidade).
    expect(wrapper.text()).not.toMatch(
      /a transação (falhou|foi recusada|foi rejeitada)/i,
    );
    expect(wrapper.text()).toContain('Não foi possível confirmar o resultado');
  });

  it('"Ver detalhes do erro" mostra o código de referência e o estado', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    store.confirmError = 'A solicitação não recebeu resposta a tempo.';

    const { wrapper } = await mountView();

    expect(wrapper.text()).not.toContain('req-1');
    await wrapper.find('.erro-view__toggle').trigger('click');

    expect(wrapper.text()).toContain('req-1');
    expect(wrapper.text()).toContain('Resultado desconhecido');
    expect(wrapper.text()).toContain(
      'A solicitação não recebeu resposta a tempo.',
    );
  });

  it('"Tentar novamente" consulta o status antes de decidir para onde ir (DEV-102/RP-07)', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockResolvedValue({
      requestId: 'req-1',
      status: 'PENDING',
      transactionId: null,
      reasonCodes: [],
      processedAt: null,
    });
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    expect(banking.getPixRequestStatus).toHaveBeenCalledWith('req-1');
    expect(router.currentRoute.value.path).toBe('/app/senha');
  });

  it('resultado já aprovado mostra o interstício e só navega ao comprovante quando o cliente confirma', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockResolvedValue({
      requestId: 'req-1',
      status: 'APPROVED',
      transactionId: 'txn-1',
      reasonCodes: ['WITHIN_CURRENT_RULES'],
      processedAt: '2026-08-18T14:32:01-03:00',
    });
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    // Não navega sozinho: mostra o resultado e espera o cliente decidir.
    expect(router.currentRoute.value.path).toBe('/app/erro');
    expect(wrapper.text()).toContain('Essa transação já foi aprovada.');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ver comprovante')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/comprovante/txn-1');
  });

  it('resultado em análise mostra o interstício e só navega ao histórico quando o cliente confirma', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockResolvedValue({
      requestId: 'req-1',
      status: 'REVIEW',
      transactionId: 'txn-1',
      reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
      processedAt: '2026-08-18T14:32:01-03:00',
    });
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/erro');
    expect(wrapper.text()).toContain(
      'Essa transação já está registrada e em análise.',
    );

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ver no histórico')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/historico');
  });

  it('resultado rejeitado/falho não é descrito como "em análise" e leva ao histórico', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockResolvedValue({
      requestId: 'req-1',
      status: 'REJECTED',
      transactionId: 'txn-1',
      reasonCodes: ['INVALID_TRANSACTION_PASSWORD'],
      processedAt: '2026-08-18T14:32:01-03:00',
    });
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain(
      'Essa transação já foi processada e não foi aprovada.',
    );
    expect(wrapper.text()).not.toContain('em análise');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ver no histórico')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/historico');
  });

  it('"Voltar" no interstício de resultado encontrado também leva para T01', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockResolvedValue({
      requestId: 'req-1',
      status: 'REVIEW',
      transactionId: 'txn-1',
      reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
      processedAt: '2026-08-18T14:32:01-03:00',
    });
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voltar')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });

  it('falha ao consultar o status não trava o cliente — segue para retry em T03', async () => {
    const store = usePixTransferStore();
    store.requestId = 'req-1';
    vi.mocked(banking.getPixRequestStatus).mockRejectedValue(
      new Error('network'),
    );
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/senha');
  });

  it('"Voltar" leva para T01', async () => {
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voltar')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });
});
