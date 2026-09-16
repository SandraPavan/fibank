import { createHash } from 'node:crypto';
import type { Recipient, Transaction } from '../repositories/models';
export const BASE_PROFILE_ID = 'PRO-1001';
export const BASE_ACCOUNT_ID = 'ACC-1001';
export const BASE_PASSWORD = '123456';
export const BASE_TIME = new Date('2026-08-18T12:00:00-03:00');
export const recipients: Recipient[] = [
  {
    recipientId: 'REC-1001',
    name: 'Marina Exemplo',
    pixKeyHash: createHash('sha256')
      .update('marina@example.test')
      .digest('hex'),
    pixKeyMasked: 'ma***@example.test',
    documentMasked: '***.111.222-**',
    institution: 'Banco Exemplo',
    createdAt: BASE_TIME,
  },
  {
    recipientId: 'REC-1002',
    name: 'Oficina Modelo',
    pixKeyHash: createHash('sha256')
      .update('oficina@example.test')
      .digest('hex'),
    pixKeyMasked: 'of***@example.test',
    documentMasked: '**.222.333/0001-**',
    institution: 'Banco Fictício',
    createdAt: BASE_TIME,
  },
];
export const transactions: Transaction[] = [
  ['TXN-1001', 'REQ-1001', 'APPROVED', 12500, '2026-08-18T09:00:00-03:00'],
  ['TXN-1002', 'REQ-1002', 'REVIEW', 250000, '2026-08-17T14:00:00-03:00'],
  ['TXN-1003', 'REQ-1003', 'APPROVED', 8500, '2026-08-18T10:00:00-03:00'],
  ['TXN-1004', 'REQ-1004', 'APPROVED', 8500, '2026-08-18T10:00:02-03:00'],
  ['TXN-1005', 'REQ-1005', 'FAILED', 4900, '2026-08-18T11:00:00-03:00'],
].map(([transactionId, requestId, status, amountCents, at]) => {
  const { recipientId, name, pixKeyMasked, documentMasked, institution } =
    recipients[0]!;
  return {
    transactionId: transactionId as string,
    requestId: requestId as string,
    accountId: BASE_ACCOUNT_ID,
    recipientSnapshot: {
      recipientId,
      name,
      pixKeyMasked,
      documentMasked,
      institution,
    },
    amountCents: amountCents as number,
    description: 'Pagamento fictício',
    deviceId: 'DEV-1001',
    status: status as Transaction['status'],
    riskScore: status === 'FAILED' ? null : status === 'REVIEW' ? 80 : 10,
    reasonCodes: [
      status === 'FAILED'
        ? 'PROCESSING_ERROR'
        : status === 'REVIEW'
          ? 'AMOUNT_REQUIRES_REVIEW'
          : 'WITHIN_CURRENT_RULES',
    ],
    createdAt: new Date(at as string),
    updatedAt: new Date(at as string),
    processedAt: status === 'REVIEW' ? null : new Date(at as string),
  };
});
