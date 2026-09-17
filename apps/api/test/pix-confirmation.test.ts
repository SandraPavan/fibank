import { describe, expect, it } from 'vitest';
import {
  authenticateConfirmation,
  validateConfirmable,
  validateConfirmationInput,
} from '../src/pix/pix-confirmation.domain';
import { hashPassword } from '../src/database/password';
import type {
  ConfirmationUnit,
  DomainRepository,
} from '../src/repositories/domain.repository';
import type { PixIntent } from '../src/repositories/models';
import { PixConfirmationService } from '../src/pix/pix-confirmation.service';
import type { PixRiskEvaluator } from '../src/pix/pix-risk.domain';
it('aceita somente senha de seis dígitos e distingue formato do corpo', async () => {
  expect(validateConfirmationInput({ transactionPassword: '123456' })).toEqual({
    transactionPassword: '123456',
  });
  for (const body of [
    undefined,
    {},
    { transactionPassword: null },
    { transactionPassword: 123456 },
    { transactionPassword: '12345' },
    { transactionPassword: 'abcdef' },
  ])
    expect(() => validateConfirmationInput(body)).toThrow(
      'INVALID_TRANSACTION_PASSWORD',
    );
  for (const body of [
    null,
    [],
    '123456',
    { transactionPassword: '123456', amountCents: 1 },
  ])
    expect(() => validateConfirmationInput(body)).toThrow(
      'INVALID_PIX_CONFIRMATION',
    );
  const hash = await hashPassword('123456');
  await expect(
    authenticateConfirmation('123456', hash),
  ).resolves.toBeUndefined();
  await expect(authenticateConfirmation('654321', hash)).rejects.toThrow(
    'INVALID_TRANSACTION_PASSWORD',
  );
});
it('aceita DRAFT e AUTH_PENDING antes da expiração e rejeita estados finais', () => {
  const expiresAt = new Date('2026-08-18T15:05:00Z');
  const now = new Date(expiresAt.getTime() - 1);
  for (const state of ['DRAFT', 'AUTH_PENDING'] as const)
    expect(() =>
      validateConfirmable({ state, expiresAt } as PixIntent, now),
    ).not.toThrow();
  for (const state of [
    'PROCESSING',
    'APPROVED',
    'REVIEW',
    'REJECTED',
    'FAILED',
  ] as const)
    expect(() =>
      validateConfirmable({ state, expiresAt } as PixIntent, now),
    ).toThrow('PIX_INTENT_NOT_CONFIRMABLE');
  expect(() =>
    validateConfirmable({ state: 'DRAFT', expiresAt } as PixIntent, expiresAt),
  ).toThrow('PIX_INTENT_EXPIRED');
});

describe('PixConfirmationService — atraso de simulação (DEV-040)', () => {
  const now = new Date('2026-08-18T14:00:00-03:00');

  async function buildDependencies() {
    const transactionPasswordHash = await hashPassword('123456');
    const unit: ConfirmationUnit = {
      account: async () => ({
        accountId: 'ACC-1',
        profileId: 'PRO-1',
        ownerName: 'Maria',
        documentMasked: '***',
        balanceCents: 1000000,
        dailyLimitCents: 1000000,
        transactionPasswordHash,
        knownDeviceIds: ['DEV-1001'],
      }),
      intent: async () => ({
        intentId: 'INT-1',
        requestId: 'REQ-1',
        accountId: 'ACC-1',
        recipientId: 'REC-1',
        amountCents: 1000,
        description: '',
        deviceId: 'DEV-1001',
        state: 'DRAFT' as const,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 300000),
      }),
      recipient: async () => ({
        recipientId: 'REC-1',
        name: 'Maria Silva',
        pixKeyMasked: 'm***@e***.com',
        documentMasked: '***',
        institution: 'Banco Fictício',
        pixKeyHash: 'hash',
        createdAt: now,
      }),
      transactions: async () => [],
      transactionByRequestId: async () => null,
      state: async () => {},
      debit: async () => {},
      createTransaction: async () => {},
    };
    const repository = {
      confirmation: (action: (unit: ConfirmationUnit) => unknown) =>
        action(unit),
    } as unknown as DomainRepository;
    const risk = {
      evaluate: async () => ({
        status: 'APPROVED' as const,
        riskScore: 10,
        reasonCodes: ['WITHIN_CURRENT_RULES'],
      }),
    } as unknown as PixRiskEvaluator;
    const runtime = { now: () => now, id: () => 'TXN-1' };
    return { repository, risk, runtime };
  }

  it('chama o atraso só depois da transação já estar persistida, sem mudar o resultado', async () => {
    const { repository, risk, runtime } = await buildDependencies();
    const calls: string[] = [];
    const service = new PixConfirmationService(repository, runtime, risk, {
      delayAfterCommit: async (requestId) => {
        calls.push(requestId);
      },
    });

    const result = await service.confirm('PRO-1', 'REQ-1', {
      transactionPassword: '123456',
    });

    expect(result).toEqual({
      requestId: 'REQ-1',
      transactionId: 'TXN-1',
      status: 'APPROVED',
      reasonCodes: ['WITHIN_CURRENT_RULES'],
      processedAt: '2026-08-18T17:00:00.000Z',
    });
    expect(calls).toEqual(['REQ-1']);
  });

  it('sem SimulationModule (parâmetro padrão), a confirmação não atrasa', async () => {
    const { repository, risk, runtime } = await buildDependencies();
    // Construído sem o 4º argumento — usa o default (`noopLatency`),
    // igual a qualquer chamador que não conhece o SimulationModule.
    const service = new PixConfirmationService(repository, runtime, risk);

    const start = Date.now();
    await service.confirm('PRO-1', 'REQ-1', { transactionPassword: '123456' });
    expect(Date.now() - start).toBeLessThan(50);
  });
});
