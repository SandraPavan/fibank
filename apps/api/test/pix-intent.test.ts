import { expect, it } from 'vitest';
import {
  validateEditable,
  validateFunds,
  validateIntentInput,
} from '../src/pix/pix-intent.domain';
import type {
  Account,
  PixIntent,
  Transaction,
} from '../src/repositories/models';
const input = {
  requestId: 'REQ-test',
  recipientId: 'REC-1001',
  amountCents: 100,
  deviceId: 'DEV-test',
};
it('valida campos, limites inteiros, formatos e patches', () => {
  expect(validateIntentInput(input, false)).toEqual({
    ...input,
    description: '',
  });
  for (const amountCents of [
    undefined,
    null,
    0,
    -1,
    1.2,
    '100',
    NaN,
    Infinity,
    2147483648,
  ])
    expect(() => validateIntentInput({ ...input, amountCents }, false)).toThrow(
      'INVALID_PIX_INTENT',
    );
  expect(
    validateIntentInput({ ...input, amountCents: 2147483647 }, false)
      .amountCents,
  ).toBe(2147483647);
  for (const body of [
    null,
    [],
    {},
    { ...input, extra: 1 },
    { ...input, requestId: 'bad' },
    { ...input, recipientId: 1 },
    { ...input, deviceId: 'DEV-' },
    { ...input, deviceId: `DEV-${'x'.repeat(97)}` },
    { ...input, description: 'x'.repeat(141) },
    { ...input, description: null },
  ])
    expect(() => validateIntentInput(body, false)).toThrow(
      'INVALID_PIX_INTENT',
    );
  for (const body of [
    {},
    { requestId: 'REQ-other' },
    { state: 'DRAFT' },
    { accountId: 'ACC-1' },
    { createdAt: 'x' },
    { expiresAt: 'x' },
  ])
    expect(() => validateIntentInput(body, true)).toThrow('INVALID_PIX_INTENT');
  expect(validateIntentInput({ description: '' }, true)).toEqual({
    description: '',
  });
});
it('soma apenas aprovadas da conta no dia civil de São Paulo, com fallback', () => {
  const account = {
    accountId: 'ACC-1',
    balanceCents: 10000,
    dailyLimitCents: 1000,
  } as Account;
  const now = new Date('2026-08-19T02:59:59.999Z');
  const tx = (overrides: Partial<Transaction>) =>
    ({
      accountId: 'ACC-1',
      amountCents: 100,
      status: 'APPROVED',
      createdAt: new Date('2026-08-18T03:00:00Z'),
      processedAt: null,
      ...overrides,
    }) as Transaction;
  const transactions = [
    tx({}),
    tx({
      createdAt: new Date('2026-08-17T00:00:00Z'),
      processedAt: new Date('2026-08-19T02:59:59Z'),
    }),
    tx({ processedAt: new Date('2026-08-18T02:59:59.999Z') }),
    tx({ processedAt: new Date('2026-08-19T03:00:00Z') }),
    tx({ accountId: 'ACC-other' }),
    ...(
      [
        'DRAFT',
        'AUTH_PENDING',
        'PROCESSING',
        'REVIEW',
        'REJECTED',
        'FAILED',
      ] as const
    ).map((status) => tx({ status })),
  ];
  for (const amount of [799, 800])
    expect(() =>
      validateFunds(account, amount, transactions, now),
    ).not.toThrow();
  expect(() => validateFunds(account, 801, transactions, now)).toThrow(
    'DAILY_LIMIT_EXCEEDED',
  );
  expect(() => validateFunds(account, 10001, [], now)).toThrow(
    'INSUFFICIENT_BALANCE',
  );
  expect(() =>
    validateFunds(account, 900, transactions, new Date('2026-08-19T03:00:00Z')),
  ).not.toThrow();
});
it('edição exige estado permitido e instante estritamente anterior à expiração', () => {
  const expiresAt = new Date('2026-08-18T15:05:00Z');
  for (const state of ['DRAFT', 'AUTH_PENDING'] as const)
    expect(() =>
      validateEditable(
        { state, expiresAt } as PixIntent,
        new Date(expiresAt.getTime() - 1),
      ),
    ).not.toThrow();
  for (const state of [
    'PROCESSING',
    'APPROVED',
    'REVIEW',
    'REJECTED',
    'FAILED',
  ] as const)
    expect(() =>
      validateEditable(
        { state, expiresAt } as PixIntent,
        new Date(expiresAt.getTime() - 1),
      ),
    ).toThrow('PIX_INTENT_NOT_EDITABLE');
  expect(() =>
    validateEditable({ state: 'DRAFT', expiresAt } as PixIntent, expiresAt),
  ).toThrow('PIX_INTENT_EXPIRED');
});
