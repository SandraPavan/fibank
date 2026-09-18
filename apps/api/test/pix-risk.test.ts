import { expect, it, vi } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { parsePixRiskConfig } from '../src/pix/pix-risk.config';
import {
  evaluateCurrentRisk,
  PixRiskEvaluator,
  transactionRiskHistory,
} from '../src/pix/pix-risk.domain';

const now = new Date('2026-08-18T15:00:00Z');
function knownDeviceInput(accountId: string, amountCents: number) {
  return {
    accountId,
    amountCents,
    deviceId: 'DEV-1001',
    knownDeviceIds: ['DEV-1001'],
    now,
  };
}

it.each([
  [499999, 'APPROVED', 10, 'WITHIN_CURRENT_RULES'],
  [500000, 'REVIEW', 80, 'AMOUNT_REQUIRES_REVIEW'],
  [500001, 'REVIEW', 80, 'AMOUNT_REQUIRES_REVIEW'],
] as const)(
  'decide deterministicamente %i centavos sem sinais comportamentais',
  (amountCents, status, riskScore, reason) => {
    const config = parsePixRiskConfig({});
    for (let repeat = 0; repeat < 3; repeat++)
      expect(
        evaluateCurrentRisk(knownDeviceInput('ACC-test', amountCents), config),
      ).toEqual({ status, riskScore, reasonCodes: [reason] });
  },
);
it('usa limiar configurado e aceita inteiros seguros positivos', () => {
  const config = parsePixRiskConfig({ PIX_REVIEW_AMOUNT_CENTS: '123' });
  expect(
    evaluateCurrentRisk(knownDeviceInput('ACC-test', 122), config).status,
  ).toBe('APPROVED');
  expect(
    evaluateCurrentRisk(knownDeviceInput('ACC-test', 123), config).status,
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
it('DEV-101: ignora histórico fora da janela ou com status irrelevante', () => {
  const config = parsePixRiskConfig({});
  const input = knownDeviceInput('ACC-test', 100);
  const outOfWindow = Array.from({ length: 10 }, () => ({
    amountCents: 100,
    status: 'APPROVED',
    createdAt: new Date(now.getTime() - config.behaviorWindowMs - 1),
    processedAt: new Date(now.getTime() - config.behaviorWindowMs - 1),
  }));
  const irrelevantStatus = Array.from({ length: 10 }, () => ({
    amountCents: 100,
    status: 'REJECTED',
    createdAt: now,
    processedAt: null,
  }));
  for (const history of [[], outOfWindow, irrelevantStatus])
    expect(evaluateCurrentRisk(input, config, history)).toEqual({
      status: 'APPROVED',
      riskScore: 10,
      reasonCodes: ['WITHIN_CURRENT_RULES'],
    });
});
it('DEV-101/CT25+CT26+CT31: frequência e soma dentro da janela combinam em REVIEW', () => {
  const config = parsePixRiskConfig({});
  const input = knownDeviceInput('ACC-test', 100);
  const amountPerEntry = Math.ceil(
    config.cumulativeAmountCentsThreshold / config.frequencyCountThreshold,
  );
  const history = Array.from(
    { length: config.frequencyCountThreshold },
    (_, index) => ({
      amountCents: amountPerEntry,
      status: 'APPROVED',
      createdAt: new Date(now.getTime() - index * 60000),
      processedAt: new Date(now.getTime() - index * 60000),
    }),
  );
  expect(evaluateCurrentRisk(input, config, history)).toEqual({
    status: 'REVIEW',
    riskScore: 80,
    reasonCodes: ['FREQUENCY_PATTERN', 'CUMULATIVE_AMOUNT_PATTERN'],
  });
});
it('DEV-101/CT29+RF-03/CT23: dispositivo novo aparece em reasonCodes sem forçar REVIEW sozinho', () => {
  const config = parsePixRiskConfig({});
  const input = {
    ...knownDeviceInput('ACC-test', 100),
    deviceId: 'DEV-NEW',
  };
  expect(evaluateCurrentRisk(input, config, [])).toEqual({
    status: 'APPROVED',
    riskScore: 40,
    reasonCodes: ['NEW_DEVICE'],
  });
});
it('DEV-101: dispositivo novo combinado com frequência cruza o limiar de REVIEW', () => {
  const config = parsePixRiskConfig({});
  const input = {
    ...knownDeviceInput('ACC-test', 100),
    deviceId: 'DEV-NEW',
  };
  const history = Array.from(
    { length: config.frequencyCountThreshold },
    (_, index) => ({
      amountCents: 100,
      status: 'APPROVED',
      createdAt: new Date(now.getTime() - index * 60000),
      processedAt: new Date(now.getTime() - index * 60000),
    }),
  );
  expect(evaluateCurrentRisk(input, config, history)).toEqual({
    status: 'REVIEW',
    riskScore: 70,
    reasonCodes: ['FREQUENCY_PATTERN', 'NEW_DEVICE'],
  });
});
it('DEV-101: valor acima do limiar força REVIEW e preserva sinais comportamentais combinados', () => {
  const config = parsePixRiskConfig({});
  const input = {
    ...knownDeviceInput('ACC-test', config.reviewAmountCents),
    deviceId: 'DEV-NEW',
  };
  expect(evaluateCurrentRisk(input, config, [])).toEqual({
    status: 'REVIEW',
    riskScore: 80,
    reasonCodes: ['AMOUNT_REQUIRES_REVIEW', 'NEW_DEVICE'],
  });
});
it('PixRiskEvaluator carrega o histórico do reader antes de decidir', async () => {
  const config = parsePixRiskConfig({});
  const evaluator = new PixRiskEvaluator(config, transactionRiskHistory);
  const reader = { transactions: vi.fn().mockResolvedValue([]) };
  const input = knownDeviceInput('ACC-test', 100);
  expect(await evaluator.evaluate(input, reader)).toEqual(
    evaluateCurrentRisk(input, config, []),
  );
  expect(reader.transactions).toHaveBeenCalledWith('ACC-test');
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
