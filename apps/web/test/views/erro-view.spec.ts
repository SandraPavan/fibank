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

  it('"Tentar novamente" volta a T03 sem reconciliar automaticamente o resultado', async () => {
    const { wrapper, router } = await mountView();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/senha');
    // Preservar: nenhuma consulta ao requestId original antes do retry
    // (RP-07 é comportamento-alvo, DEV-102, bloqueado).
    expect(banking.getPixIntent).not.toHaveBeenCalled();
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
