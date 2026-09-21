import type { WorkspaceSummaryResponse } from '@finbank/contracts';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as facilitatorApi from '../../src/api/facilitator';
import { ApiError } from '../../src/api/http';
import { useFacilitatorStore } from '../../src/stores/facilitator';

vi.mock('../../src/api/facilitator');

const workspaceA: WorkspaceSummaryResponse = {
  workspaceId: 'WS-a',
  groupSlug: 'grupo-a',
  createdAt: '2026-08-18T14:00:00-03:00',
};
const workspaceB: WorkspaceSummaryResponse = {
  workspaceId: 'WS-b',
  groupSlug: 'grupo-b',
  createdAt: '2026-08-18T15:00:00-03:00',
};

function invalidSecretError() {
  return new ApiError({
    type: 'urn:finbank:problem:invalid_facilitator_secret',
    title: 'Acesso reservado inválido',
    status: 401,
    code: 'INVALID_FACILITATOR_SECRET',
    detail: 'Informe o segredo do facilitador para esta operação.',
    requestId: 'req-x',
    traceId: 'trace-x',
  });
}

describe('useFacilitatorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('authenticate: segredo válido guarda o segredo em memória', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([]);
    const store = useFacilitatorStore();

    const ok = await store.authenticate('segredo-certo');

    expect(ok).toBe(true);
    expect(store.isAuthenticated).toBe(true);
    expect(store.authError).toBeNull();
    expect(facilitatorApi.listFacilitatorWorkspaces).toHaveBeenCalledWith(
      'segredo-certo',
    );
  });

  it('authenticate: segredo inválido não autentica e expõe a mensagem', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockRejectedValue(
      invalidSecretError(),
    );
    const store = useFacilitatorStore();

    const ok = await store.authenticate('segredo-errado');

    expect(ok).toBe(false);
    expect(store.isAuthenticated).toBe(false);
    expect(store.authError).toBe(
      'Informe o segredo do facilitador para esta operação.',
    );
  });

  it('refresh: não chama a API sem segredo autenticado', async () => {
    const store = useFacilitatorStore();

    await store.refresh();

    expect(facilitatorApi.listFacilitatorWorkspaces).not.toHaveBeenCalled();
  });

  it('refresh: combina lista de grupos com as métricas de cada um', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([
      workspaceA,
      workspaceB,
    ]);
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockImplementation(
      async (groupSlug) => ({
        groupSlug,
        approved: 1,
        review: 2,
        reviewSlaBreached: 0,
        rejected: 0,
        failed: 0,
      }),
    );
    const store = useFacilitatorStore();
    await store.authenticate('segredo-certo');

    await store.refresh();

    expect(store.workspaces).toEqual([
      { ...workspaceA, metrics: { groupSlug: 'grupo-a', approved: 1, review: 2, reviewSlaBreached: 0, rejected: 0, failed: 0 }, metricsError: null },
      { ...workspaceB, metrics: { groupSlug: 'grupo-b', approved: 1, review: 2, reviewSlaBreached: 0, rejected: 0, failed: 0 }, metricsError: null },
    ]);
    expect(store.loadError).toBeNull();
  });

  it('refresh: falha de métrica de um grupo não derruba os demais', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([
      workspaceA,
      workspaceB,
    ]);
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockImplementation(
      async (groupSlug) => {
        if (groupSlug === 'grupo-a') throw new Error('falha de rede');
        return {
          groupSlug,
          approved: 5,
          review: 0,
          reviewSlaBreached: 0,
          rejected: 0,
          failed: 0,
        };
      },
    );
    const store = useFacilitatorStore();
    await store.authenticate('segredo-certo');

    await store.refresh();

    expect(store.workspaces[0]).toMatchObject({
      groupSlug: 'grupo-a',
      metrics: null,
      metricsError: 'Não foi possível carregar as métricas deste grupo.',
    });
    expect(store.workspaces[1]).toMatchObject({
      groupSlug: 'grupo-b',
      metrics: { approved: 5 },
      metricsError: null,
    });
  });

  it('refresh: segredo invalidado no servidor desloga e informa o motivo', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(invalidSecretError());
    const store = useFacilitatorStore();
    await store.authenticate('segredo-certo');

    await store.refresh();

    expect(store.isAuthenticated).toBe(false);
    expect(store.authError).toBe('Segredo inválido ou expirado. Entre novamente.');
  });

  it('logout limpa todo o estado, inclusive o segredo em memória', async () => {
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockResolvedValue([
      workspaceA,
    ]);
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockResolvedValue({
      groupSlug: 'grupo-a',
      approved: 1,
      review: 0,
      reviewSlaBreached: 0,
      rejected: 0,
      failed: 0,
    });
    const store = useFacilitatorStore();
    await store.authenticate('segredo-certo');
    await store.refresh();

    store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.workspaces).toEqual([]);
  });

  it('REVIEW: logout durante um refresh em andamento não repopula a store depois', async () => {
    let resolveList: (value: WorkspaceSummaryResponse[]) => void = () => {};
    vi.mocked(facilitatorApi.listFacilitatorWorkspaces).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    vi.mocked(facilitatorApi.getWorkspaceMetrics).mockResolvedValue({
      groupSlug: 'grupo-a',
      approved: 1,
      review: 0,
      reviewSlaBreached: 0,
      rejected: 0,
      failed: 0,
    });
    const store = useFacilitatorStore();
    store.secret = 'segredo-certo'; // sessão já autenticada, sem chamar authenticate()

    const pending = store.refresh();
    store.logout();
    resolveList([workspaceA]);
    await pending;

    expect(store.isAuthenticated).toBe(false);
    expect(store.workspaces).toEqual([]);
    expect(store.loading).toBe(false);
  });
});
