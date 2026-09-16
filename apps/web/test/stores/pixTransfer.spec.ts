import type {
  PixConfirmationResponse,
  RecipientResponse,
} from '@finbank/contracts';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as banking from '../../src/api/banking';
import { ApiError, RequestTimeoutError } from '../../src/api/http';
import { usePixTransferStore } from '../../src/stores/pixTransfer';

vi.mock('../../src/api/banking');
vi.mock('../../src/api/device', () => ({
  getDeviceId: () => 'device-1',
}));

const recipient: RecipientResponse = {
  recipientId: 'rec-1',
  name: 'Maria Silva',
  pixKeyMasked: 'm***@e***.com',
  documentMasked: '***.456.789-**',
  institution: 'FinBank',
};

describe('usePixTransferStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('selectFrequentRecipient define o destinatário sem chamar a API', () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);

    expect(store.recipient).toEqual(recipient);
    expect(store.pixKey).toBe('');
    expect(banking.resolveRecipient).not.toHaveBeenCalled();
  });

  it('setPixKey invalida um destinatário já resolvido', () => {
    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.setPixKey('outra@chave.com');

    expect(store.recipient).toBeNull();
    expect(store.pixKey).toBe('outra@chave.com');
  });

  it('bloqueia avanço com valor zero', async () => {
    const store = usePixTransferStore();
    store.pixKey = 'maria@example.com';
    store.amountCents = 0;

    const ok = await store.continueToReview();

    expect(ok).toBe(false);
    expect(store.errorMessage).toContain('valor maior que zero');
    expect(banking.createPixIntent).not.toHaveBeenCalled();
  });

  it('bloqueia avanço sem chave nem destinatário selecionado', async () => {
    const store = usePixTransferStore();
    store.amountCents = 1000;

    const ok = await store.continueToReview();

    expect(ok).toBe(false);
    expect(store.errorMessage).toContain('chave PIX');
  });

  it('resolve a chave e cria a intenção quando não há requestId (RP-01)', async () => {
    vi.mocked(banking.resolveRecipient).mockResolvedValue(recipient);
    vi.mocked(banking.createPixIntent).mockResolvedValue({
      requestId: 'req-1',
      accountId: 'acc-1',
      recipientId: recipient.recipientId,
      amountCents: 1000,
      description: '',
      deviceId: 'device-1',
      state: 'DRAFT',
      createdAt: '2026-08-18T14:00:00-03:00',
      expiresAt: '2026-08-18T14:05:00-03:00',
    });

    const store = usePixTransferStore();
    store.pixKey = 'maria@example.com';
    store.amountCents = 1000;

    const ok = await store.continueToReview();

    expect(ok).toBe(true);
    expect(banking.resolveRecipient).toHaveBeenCalledWith('maria@example.com');
    expect(banking.createPixIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: recipient.recipientId,
        amountCents: 1000,
        deviceId: 'device-1',
      }),
    );
    expect(store.requestId).toMatch(/^REQ-[0-9a-f-]{36}$/);
    expect(banking.updatePixIntent).not.toHaveBeenCalled();
  });

  it('contato frequente pula a resolução e usa o recipientId direto', async () => {
    vi.mocked(banking.createPixIntent).mockResolvedValue({
      requestId: 'req-1',
      accountId: 'acc-1',
      recipientId: recipient.recipientId,
      amountCents: 500,
      description: '',
      deviceId: 'device-1',
      state: 'DRAFT',
      createdAt: '2026-08-18T14:00:00-03:00',
      expiresAt: '2026-08-18T14:05:00-03:00',
    });

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 500;

    const ok = await store.continueToReview();

    expect(ok).toBe(true);
    expect(banking.resolveRecipient).not.toHaveBeenCalled();
    expect(banking.createPixIntent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: recipient.recipientId }),
    );
  });

  it('edita a intenção existente via PATCH quando já há requestId (RP-02)', async () => {
    vi.mocked(banking.updatePixIntent).mockResolvedValue({
      requestId: 'req-1',
      accountId: 'acc-1',
      recipientId: recipient.recipientId,
      amountCents: 2000,
      description: '',
      deviceId: 'device-1',
      state: 'DRAFT',
      createdAt: '2026-08-18T14:00:00-03:00',
      expiresAt: '2026-08-18T14:05:00-03:00',
    });

    const store = usePixTransferStore();
    store.selectFrequentRecipient(recipient);
    store.amountCents = 2000;
    store.requestId = 'req-1';

    const ok = await store.continueToReview();

    expect(ok).toBe(true);
    expect(banking.updatePixIntent).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ amountCents: 2000 }),
    );
    expect(banking.createPixIntent).not.toHaveBeenCalled();
  });

  it('nunca chama endpoint de confirmação (processamento é só em T03)', async () => {
    vi.mocked(banking.resolveRecipient).mockResolvedValue(recipient);
    vi.mocked(banking.createPixIntent).mockResolvedValue({
      requestId: 'req-1',
      accountId: 'acc-1',
      recipientId: recipient.recipientId,
      amountCents: 1000,
      description: '',
      deviceId: 'device-1',
      state: 'DRAFT',
      createdAt: '2026-08-18T14:00:00-03:00',
      expiresAt: '2026-08-18T14:05:00-03:00',
    });

    const store = usePixTransferStore();
    store.pixKey = 'maria@example.com';
    store.amountCents = 1000;
    await store.continueToReview();

    expect(banking.confirmPixIntent).not.toHaveBeenCalled();
  });

  it('expõe a mensagem de erro do backend quando a chave é inválida', async () => {
    vi.mocked(banking.resolveRecipient).mockRejectedValue(
      new ApiError({
        type: 'urn:finbank:problem:invalid_pix_key',
        title: 'Chave inválida',
        status: 400,
        code: 'INVALID_PIX_KEY',
        detail: 'Informe uma chave PIX fictícia de email válida.',
        requestId: 'req-x',
        traceId: 'trace-x',
      }),
    );

    const store = usePixTransferStore();
    store.pixKey = 'chave-invalida';
    store.amountCents = 1000;

    const ok = await store.continueToReview();

    expect(ok).toBe(false);
    expect(store.errorMessage).toBe(
      'Informe uma chave PIX fictícia de email válida.',
    );
    expect(banking.createPixIntent).not.toHaveBeenCalled();
  });

  describe('confirm (T03 — DEV-032)', () => {
    function givenActiveIntent() {
      const store = usePixTransferStore();
      store.selectFrequentRecipient(recipient);
      store.amountCents = 1000;
      store.requestId = 'req-1';
      return store;
    }

    it('não chama a API quando não há requestId', async () => {
      const store = usePixTransferStore();

      const result = await store.confirm('123456');

      expect(result).toBeNull();
      expect(banking.confirmPixIntent).not.toHaveBeenCalled();
    });

    it('confirma com sucesso e guarda o resultado (APPROVED)', async () => {
      const response = {
        requestId: 'req-1',
        transactionId: 'PIX-1',
        status: 'APPROVED' as const,
        reasonCodes: ['WITHIN_CURRENT_RULES'],
        processedAt: '2026-08-18T14:32:01-03:00',
      };
      vi.mocked(banking.confirmPixIntent).mockResolvedValue(response);
      const store = givenActiveIntent();

      const result = await store.confirm('123456');

      expect(result).toEqual(response);
      expect(store.lastConfirmation).toEqual(response);
      expect(store.confirmError).toBeNull();
      expect(banking.confirmPixIntent).toHaveBeenCalledWith('req-1', {
        transactionPassword: '123456',
      });
    });

    it('RP-04: ignora uma segunda chamada enquanto a primeira está em andamento', async () => {
      let resolveFirst: (value: PixConfirmationResponse) => void = () => {};
      vi.mocked(banking.confirmPixIntent).mockReturnValue(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      const store = givenActiveIntent();

      const first = store.confirm('123456');
      const second = store.confirm('123456');

      resolveFirst({
        requestId: 'req-1',
        transactionId: 'PIX-1',
        status: 'APPROVED',
        reasonCodes: [],
        processedAt: '2026-08-18T14:32:01-03:00',
      });
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(secondResult).toBeNull();
      expect(firstResult).not.toBeNull();
      expect(banking.confirmPixIntent).toHaveBeenCalledTimes(1);
    });

    it('senha inválida define confirmError e preserva requestId/recipient para nova tentativa', async () => {
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
      const store = givenActiveIntent();

      const result = await store.confirm('000000');

      expect(result).toBeNull();
      expect(store.confirmError).toBe('Informe uma senha transacional válida.');
      expect(store.confirmOutcome).toBe('known-error');
      expect(store.requestId).toBe('req-1');
      expect(store.recipient).toEqual(recipient);
      expect(store.lastConfirmation).toBeNull();
    });

    it('timeout do cliente define confirmOutcome como resultado desconhecido (F05/RP-07)', async () => {
      vi.mocked(banking.confirmPixIntent).mockRejectedValue(
        new RequestTimeoutError(),
      );
      const store = givenActiveIntent();

      const result = await store.confirm('123456');

      expect(result).toBeNull();
      expect(store.confirmOutcome).toBe('unknown-result');
      expect(store.requestId).toBe('req-1');
    });

    it('falha de rede sem resposta estruturada também é resultado desconhecido', async () => {
      vi.mocked(banking.confirmPixIntent).mockRejectedValue(
        new TypeError('Failed to fetch'),
      );
      const store = givenActiveIntent();

      const result = await store.confirm('123456');

      expect(result).toBeNull();
      expect(store.confirmOutcome).toBe('unknown-result');
    });

    it('nunca grava a senha em nenhum campo do estado', async () => {
      const password = '654321';
      vi.mocked(banking.confirmPixIntent).mockResolvedValue({
        requestId: 'req-1',
        transactionId: 'PIX-1',
        status: 'APPROVED',
        reasonCodes: [],
        processedAt: '2026-08-18T14:32:01-03:00',
      });
      const store = givenActiveIntent();

      await store.confirm(password);

      expect(JSON.stringify(store.$state)).not.toContain(password);
    });
  });
});
