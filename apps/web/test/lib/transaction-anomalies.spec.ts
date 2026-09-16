import type { TransactionResponse } from '@finbank/contracts';
import { describe, expect, it } from 'vitest';
import {
  findPossibleDuplicates,
  isStaleReview,
} from '../../src/lib/transactionAnomalies';

const NOW = new Date('2026-08-18T14:00:00-03:00');

function transaction(
  overrides: Partial<TransactionResponse> = {},
): TransactionResponse {
  return {
    transactionId: 'PIX-1',
    requestId: 'req-1',
    type: 'PIX',
    recipientSnapshot: {
      recipientId: 'rec-1',
      name: 'Maria Silva',
      pixKeyMasked: 'm***@e***.com',
      documentMasked: '***.456.789-**',
      institution: 'FinBank',
    },
    amountCents: 875000,
    description: '',
    status: 'APPROVED',
    reasonCodes: [],
    createdAt: '2026-08-18T14:00:00-03:00',
    processedAt: '2026-08-18T14:00:01-03:00',
    ...overrides,
  };
}

describe('isStaleReview', () => {
  it('não sinaliza uma transação aprovada, mesmo que antiga', () => {
    const old = transaction({
      status: 'APPROVED',
      createdAt: '2026-08-01T00:00:00-03:00',
    });

    expect(isStaleReview(old, NOW)).toBe(false);
  });

  it('não sinaliza REVIEW com menos de 24h (23h59)', () => {
    const fresh = transaction({
      status: 'REVIEW',
      createdAt: '2026-08-17T14:01:00-03:00',
    });

    expect(isStaleReview(fresh, NOW)).toBe(false);
  });

  it('sinaliza REVIEW com mais de 24h (F07 — stale-review)', () => {
    const stale = transaction({
      status: 'REVIEW',
      createdAt: '2026-08-17T13:00:00-03:00', // 25h antes de NOW
    });

    expect(isStaleReview(stale, NOW)).toBe(true);
  });
});

describe('findPossibleDuplicates', () => {
  it('sinaliza duas transações com mesmo destinatário/valor a poucos minutos (duplicate-retry)', () => {
    const first = transaction({
      transactionId: 'PIX-1',
      createdAt: '2026-08-18T14:00:00-03:00',
    });
    const second = transaction({
      transactionId: 'PIX-2',
      requestId: 'req-2',
      createdAt: '2026-08-18T14:00:30-03:00',
    });

    const flagged = findPossibleDuplicates([first, second]);

    expect(flagged).toEqual(new Set(['PIX-1', 'PIX-2']));
  });

  it('não sinaliza quando o valor difere', () => {
    const first = transaction({ transactionId: 'PIX-1', amountCents: 1000 });
    const second = transaction({
      transactionId: 'PIX-2',
      requestId: 'req-2',
      amountCents: 2000,
      createdAt: '2026-08-18T14:00:10-03:00',
    });

    expect(findPossibleDuplicates([first, second]).size).toBe(0);
  });

  it('não sinaliza quando o intervalo é maior que a janela (5 min)', () => {
    const first = transaction({
      transactionId: 'PIX-1',
      createdAt: '2026-08-18T14:00:00-03:00',
    });
    const second = transaction({
      transactionId: 'PIX-2',
      requestId: 'req-2',
      createdAt: '2026-08-18T14:10:00-03:00',
    });

    expect(findPossibleDuplicates([first, second]).size).toBe(0);
  });

  it('não sinaliza destinatários diferentes', () => {
    const first = transaction({ transactionId: 'PIX-1' });
    const second = transaction({
      transactionId: 'PIX-2',
      requestId: 'req-2',
      recipientSnapshot: {
        recipientId: 'rec-2',
        name: 'João Souza',
        pixKeyMasked: 'j***@e***.com',
        documentMasked: '***.111.222-**',
        institution: 'FinBank',
      },
    });

    expect(findPossibleDuplicates([first, second]).size).toBe(0);
  });
});
