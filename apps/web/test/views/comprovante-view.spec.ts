import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { createFinBankRouter } from '../../src/router';
import ComprovanteView from '../../src/views/ComprovanteView.vue';

vi.mock('../../src/api/banking');

const approvedTransaction = {
  transactionId: 'PIX-1',
  requestId: 'req-1',
  type: 'PIX' as const,
  recipientSnapshot: {
    recipientId: 'rec-1',
    name: 'Maria Silva',
    pixKeyMasked: 'm***@e***.com',
    documentMasked: '***.456.789-**',
    institution: 'FinBank',
  },
  amountCents: 150000,
  description: 'Aluguel',
  status: 'APPROVED' as const,
  reasonCodes: ['WITHIN_CURRENT_RULES'],
  createdAt: '2026-08-18T14:30:00-03:00',
  processedAt: '2026-08-18T14:32:01-03:00',
};

async function mountView(transactionId = 'PIX-1') {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push(`/app/comprovante/${transactionId}`);
  await router.isReady();

  // Mount direto não passa pelo `props: true` da rota (isso só acontece
  // via <RouterView>), então a prop precisa ser passada explicitamente.
  const wrapper = mount(ComprovanteView, {
    global: { plugins: [router] },
    props: { transactionId },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('ComprovanteView (T04)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renderiza o comprovante para uma transação aprovada', async () => {
    vi.mocked(banking.getTransaction).mockResolvedValue(approvedTransaction);

    const { wrapper } = await mountView();

    expect(banking.getTransaction).toHaveBeenCalledWith('PIX-1');
    expect(wrapper.text()).toContain('Maria Silva');
    expect(wrapper.text()).toContain('FinBank');
    expect(wrapper.text()).toContain('m***@e***.com');
    expect(wrapper.text()).toContain('R$');
    expect(wrapper.text()).toContain('PIX-1');
  });

  it('redireciona para T05 quando a transação não está aprovada (RP-05)', async () => {
    vi.mocked(banking.getTransaction).mockResolvedValue({
      ...approvedTransaction,
      status: 'REVIEW',
    });

    const { router } = await mountView();

    expect(router.currentRoute.value.path).toBe('/app/erro');
  });

  it('redireciona para T05 quando a transação não é encontrada', async () => {
    vi.mocked(banking.getTransaction).mockRejectedValue(new Error('not found'));

    const { router } = await mountView('desconhecida');

    expect(router.currentRoute.value.path).toBe('/app/erro');
  });
});
