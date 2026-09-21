import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as facilitatorApi from '../../src/api/facilitator';
import { createFinBankRouter } from '../../src/router';
import { useFacilitatorStore } from '../../src/stores/facilitator';
import FacilitatorView from '../../src/views/FacilitatorView.vue';

vi.mock('../../src/api/facilitator');

async function mountView() {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push('/facilitator');
  await router.isReady();

  const wrapper = mount(FacilitatorView, { global: { plugins: [router] } });
  return { wrapper, router };
}

async function login(wrapper: Awaited<ReturnType<typeof mountView>>['wrapper']) {
  await wrapper.find('input[type="password"]').setValue('segredo-certo');
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

describe('FacilitatorView (DEV-104)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pede o segredo antes de mostrar qualquer dado', async () => {
    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Segredo do facilitador');
    expect(wrapper.text()).not.toContain('Nenhum grupo criado ainda.');
    expect(facilitatorApi.listFacilitatorWorkspaces).not.toHaveBeenCalled();
  });

  it('segredo inválido mostra a mensagem e não sai da tela de entrada', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockRejectedValue(
      new Error('unauthorized'),
    );
    const { wrapper } = await mountView();

    await login(wrapper);

    expect(wrapper.text()).toContain('Não foi possível validar o segredo.');
    expect(wrapper.text()).toContain('Segredo do facilitador');
  });

  it('segredo válido carrega grupos e métricas agregadas', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([
      { workspaceId: 'WS-a', groupSlug: 'grupo-a', createdAt: '2026-08-18T14:00:00-03:00' },
    ]);
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockResolvedValue({
      groupSlug: 'grupo-a',
      approved: 3,
      review: 1,
      reviewSlaBreached: 1,
      rejected: 0,
      failed: 0,
    });
    const { wrapper } = await mountView();

    await login(wrapper);

    expect(wrapper.text()).toContain('grupo-a');
    expect(wrapper.text()).toContain('3');
    // Aceite: não mostra "cenário reproduzido" por grupo (limitação declarada).
    expect(wrapper.text()).toContain('restritos ao ambiente padrão');
  });

  it('sem grupos criados, mostra estado vazio explícito', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([]);
    const { wrapper } = await mountView();

    await login(wrapper);

    expect(wrapper.text()).toContain('Nenhum grupo criado ainda.');
  });

  it('"Sair" volta para a tela de entrada e limpa o segredo em memória', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([]);
    const { wrapper } = await mountView();
    await login(wrapper);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Sair')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Segredo do facilitador');
  });

  it('REVIEW: montar já autenticado (ex.: voltar de outra rota) retoma refresh e polling', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([
      { workspaceId: 'WS-a', groupSlug: 'grupo-a', createdAt: '2026-08-18T14:00:00-03:00' },
    ]);
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockResolvedValue({
      groupSlug: 'grupo-a',
      approved: 1,
      review: 0,
      reviewSlaBreached: 0,
      rejected: 0,
      failed: 0,
    });
    // Sessão já autenticada antes de montar — simula voltar de outra rota
    // sem passar pelo formulário de login.
    useFacilitatorStore().secret = 'segredo-existente';

    const { wrapper } = await mountView();
    await flushPromises();

    expect(facilitatorApi.listFacilitatorWorkspaces).toHaveBeenCalledWith(
      'segredo-existente',
    );
    expect(wrapper.text()).toContain('grupo-a');
  });

  it('atualiza os grupos periodicamente enquanto autenticado (polling)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([]);
    const { wrapper } = await mountView();
    await login(wrapper);

    expect(facilitatorApi.listFacilitatorWorkspaces).toHaveBeenCalledTimes(2); // authenticate + refresh inicial

    await vi.advanceTimersByTimeAsync(8000);

    expect(facilitatorApi.listFacilitatorWorkspaces).toHaveBeenCalledTimes(3);
  });
});
