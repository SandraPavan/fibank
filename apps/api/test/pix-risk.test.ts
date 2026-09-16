import { expect, it, vi } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { parsePixRiskConfig } from '../src/pix/pix-risk.config';
import {
  evaluateCurrentRisk,
  PixRiskEvaluator,
  transactionRiskHistory,
} from '../src/pix/pix-risk.domain';

it.each([
  [499999, 'APPROVED', 10, 'WITHIN_CURRENT_RULES'],
  [500000, 'REVIEW', 80, 'AMOUNT_REQUIRES_REVIEW'],
  [500001, 'REVIEW', 80, 'AMOUNT_REQUIRES_REVIEW'],
] as const)(
  'decide deterministicamente %i centavos',
  (amountCents, status, riskScore, reason) => {
    const config = parsePixRiskConfig({});
    for (let repeat = 0; repeat < 3; repeat++)
      expect(
        evaluateCurrentRisk({ accountId: 'ACC-test', amountCents }, config),
      ).toEqual({ status, riskScore, reasonCodes: [reason] });
  },
);
it('usa limiar configurado e aceita inteiros seguros positivos', () => {
  const config = parsePixRiskConfig({ PIX_REVIEW_AMOUNT_CENTS: '123' });
  expect(
    evaluateCurrentRisk({ accountId: 'ACC-test', amountCents: 122 }, config)
      .status,
  ).toBe('APPROVED');
  expect(
    evaluateCurrentRisk({ accountId: 'ACC-test', amountCents: 123 }, config)
      .status,
  ).toBe('REVIEW');
  expect(
    parsePixRiskConfig({ PIX_REVIEW_AMOUNT_CENTS: '1' }).reviewAmountCents,
  ).toBe(1);
  expect(
    parsePixRiskConfig({
      PIX_REVIEW_AMOUNT_CENTS: String(Number.MAX_SAFE_INTEGER),
    }).reviewAmountCents,
  ).toBe(Number.MAX_SAFE_INTEGER);
});
it.each([
  '',
  ' ',
  ' 500000',
  '500000 ',
  '0',
  '-1',
  '+1',
  '1.0',
  '1.5',
  '1e3',
  '0x10',
  'NaN',
  'Infinity',
  '500000\n',
  '9007199254740992',
])('recusa configuração presente inválida %j', (raw) => {
  expect(() => parsePixRiskConfig({ PIX_REVIEW_AMOUNT_CENTS: raw })).toThrow(
    'Configuração de risco inválida.',
  );
});
it('histórico variável permanece disponível sem alterar decisão', async () => {
  const evaluator = new PixRiskEvaluator(
    parsePixRiskConfig({}),
    transactionRiskHistory,
  );
  const reader = { transactions: vi.fn() };
  for (const amountCents of [499999, 500000, 500001]) {
    const input = { accountId: 'ACC-test', amountCents };
    for (const history of [
      [],
      [{ amountCents: 9999999, status: 'APPROVED' }],
      Array.from({ length: 50 }, () => ({
        amountCents: 500000,
        status: 'REVIEW',
      })),
    ]) {
      reader.transactions.mockResolvedValue(history);
      expect(await evaluator.evaluate(input, reader)).toEqual(
        evaluateCurrentRisk(input, parsePixRiskConfig({})),
      );
      expect(reader.transactions).toHaveBeenLastCalledWith(input.accountId);
    }
  }
});

it('recusa inicialização do módulo com configuração inválida', async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { PixIntentModule } = await import('../src/pix/pix-intent.module');
  let context: INestApplicationContext | undefined;
  vi.stubEnv('PIX_REVIEW_AMOUNT_CENTS', '');
  try {
    await expect(
      NestFactory.createApplicationContext(PixIntentModule, {
        abortOnError: false,
        logger: false,
      }).then((created) => {
        context = created;
        return created;
      }),
    ).rejects.toThrow('Configuração de risco inválida.');
  } finally {
    await context?.close();
    vi.unstubAllEnvs();
  }
});
