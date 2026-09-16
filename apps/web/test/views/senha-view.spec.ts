import type { PixConfirmationResponse } from '@finbank/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as banking from '../../src/api/banking';
import { ApiError, RequestTimeoutError } from '../../src/api/http';
import { createFinBankRouter } from '../../src/router';
import { usePixTransferStore } from '../../src/stores/pixTransfer';
import SenhaView from '../../src/views/SenhaView.vue';

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
  await router.push('/app/senha');
  await router.isReady();

  const wrapper = mount(SenhaView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

async function typeDigits(
  wrapper: Awaited<ReturnType<typeof mountView>>['wrapper'],
  digits: string,
) {
  for (const digit of digits) {
    const button = wrapper
      .findAll('.app-pin-pad__key')
      .find((candidate) => candidate.text() === digit);
    await button?.trigger('click');
  }
}

describe('SenhaView (T03)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('redireciona para T01 quando não há intenção ativa (acesso direto)', async () => {
    const { router } = await mountView();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });

  it('exibe o resumo do favorecido e do valor', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 150000;
    store.requestId = 'req-1';

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Maria Silva');
    expect(wrapper.text()).toContain('R$');
  });

  it('os dots do teclado nunca revelam os dígitos digitados', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper } = await mountView();
    await typeDigits(wrapper, '482');

    // Os indicadores são só bolinhas preenchidas/vazias (via classe CSS);
    // o próprio teclado numérico sempre mostra os dígitos 0-9 como
    // rótulos dos botões — o que não pode vazar é o valor digitado.
    const dots = wrapper.find('.app-pin-pad__dots');
    expect(dots.text()).toBe('');
    expect(dots.findAll('.app-pin-pad__dot--filled')).toHaveLength(3);
  });

  it('botão de confirmação só habilita com os 6 dígitos', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper } = await mountView();
    const confirmButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Confirmar transação'));

    expect(confirmButton?.attributes('disabled')).toBeDefined();

    await typeDigits(wrapper, '123456');

    expect(confirmButton?.attributes('disabled')).toBeUndefined();
  });

  it('"Cancelar" volta para T02 sem chamar a API', async () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancelar')
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/revisar');
    expect(banking.confirmPixIntent).not.toHaveBeenCalled();
  });

  it('confirma com sucesso (APPROVED) e navega para o comprovante (T04)', async () => {
    vi.mocked(banking.confirmPixIntent).mockResolvedValue({
      requestId: 'req-1',
      transactionId: 'PIX-1',
      status: 'APPROVED',
      reasonCodes: ['WITHIN_CURRENT_RULES'],
      processedAt: '2026-08-18T14:32:01-03:00',
    });

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await typeDigits(wrapper, '123456');
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Confirmar transação'))
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/comprovante/PIX-1');
  });

  it('cliques repetidos durante uma chamada ativa não disparam nova confirmação (RP-04)', async () => {
    let resolveConfirm: (value: PixConfirmationResponse) => void = () => {};
    vi.mocked(banking.confirmPixIntent).mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper } = await mountView();
    await typeDigits(wrapper, '123456');
    const confirmButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Confirmar'));

    await confirmButton?.trigger('click');
    await confirmButton?.trigger('click');

    resolveConfirm({
      requestId: 'req-1',
      transactionId: 'PIX-1',
      status: 'APPROVED',
      reasonCodes: [],
      processedAt: '2026-08-18T14:32:01-03:00',
    });
    await flushPromises();

    expect(banking.confirmPixIntent).toHaveBeenCalledTimes(1);
  });

  it('senha inválida (erro conhecido) fica em T03, sem navegar', async () => {
    vi.mocked(banking.confirmPixIntent).mockRejectedValue(
      new ApiError({
        type: 'urn:finbank:problem:invalid_transaction_password',
        title: 'Senha transacional inválida',
        status: 422,
        code: 'INVALID_TRANSACTION_PASSWORD',
        detail: 'Informe uma senha transacional válida.',
        requestId: 'req-x',
        traceId: 'trace-x',
      }),
    );

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await typeDigits(wrapper, '000000');
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Confirmar transação'))
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/senha');
    expect(wrapper.text()).toContain('Informe uma senha transacional válida.');
  });

  it('resultado desconhecido (timeout) navega para T05', async () => {
    vi.mocked(banking.confirmPixIntent).mockRejectedValue(
      new RequestTimeoutError(),
    );

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 1000;
    store.requestId = 'req-1';

    const { wrapper, router } = await mountView();
    await typeDigits(wrapper, '123456');
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Confirmar transação'))
      ?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/app/erro');
  });
});
