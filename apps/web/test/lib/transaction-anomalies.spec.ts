import type { TransactionResponse } from '@finbank/contracts';
import { describe, expect, it } from 'vitest';
import { findPossibleDuplicates } from '../../src/lib/transactionAnomalies';

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
    ageMs: null,
    slaBreached: false,
    ...overrides,
  };
}

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
