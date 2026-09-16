import { describe, expect, it } from 'vitest';
import { parseFixedClock } from '../src/database/clock.config';
import {
  assertSimulationEnabled,
  assertSimulationStartupAllowed,
  parseSimulationConfig,
} from '../src/simulation/simulation.config';
import { SimulationLatencyService } from '../src/simulation/simulation-latency.service';
import {
  DATA_SCENARIOS,
  TIMEOUT_SCENARIO_ID,
} from '../src/simulation/scenarios';
import { validateTimeoutScenarioInput } from '../src/simulation/simulation.service';

describe('parseFixedClock', () => {
  it('retorna undefined quando a variável não está definida', () => {
    expect(parseFixedClock({})).toBeUndefined();
  });

  it('faz o parse de uma data ISO 8601 válida', () => {
    const clock = parseFixedClock({ FIXED_CLOCK: '2026-08-18T14:00:00-03:00' });
    expect(clock?.toISOString()).toBe('2026-08-18T17:00:00.000Z');
  });

  it('recusa uma data inválida', () => {
    expect(() => parseFixedClock({ FIXED_CLOCK: 'não é data' })).toThrow(
      'FIXED_CLOCK deve ser uma data ISO 8601 válida.',
    );
  });
});

describe('parseSimulationConfig / guardas de habilitação', () => {
  it('fica habilitado somente com WORKSHOP_MODE=true', () => {
    expect(parseSimulationConfig({}).enabled).toBe(false);
    expect(parseSimulationConfig({ WORKSHOP_MODE: 'false' }).enabled).toBe(
      false,
    );
    expect(parseSimulationConfig({ WORKSHOP_MODE: 'true' }).enabled).toBe(
      true,
    );
  });

  it('falha a inicialização em NODE_ENV=production sem WORKSHOP_MODE', () => {
    expect(() =>
      assertSimulationStartupAllowed(
        { enabled: false },
        { NODE_ENV: 'production' },
      ),
    ).toThrow('SimulationModule desabilitado');
  });

  it('inicializa normalmente com WORKSHOP_MODE=true, mesmo em produção', () => {
    expect(() =>
      assertSimulationStartupAllowed(
        { enabled: true },
        { NODE_ENV: 'production' },
      ),
    ).not.toThrow();
  });

  it('inicializa normalmente fora de produção, mesmo sem WORKSHOP_MODE', () => {
    expect(() =>
      assertSimulationStartupAllowed({ enabled: false }, {}),
    ).not.toThrow();
  });

  it('recusa cada chamada quando desabilitado, sem derrubar o processo', () => {
    expect(() => assertSimulationEnabled({ enabled: false })).toThrow(
      'SIMULATION_DISABLED',
    );
    expect(() => assertSimulationEnabled({ enabled: true })).not.toThrow();
  });
});

describe('SimulationLatencyService', () => {
  it('não atrasa quando nenhuma regra foi registrada (no-op)', async () => {
    const service = new SimulationLatencyService();
    const start = Date.now();
    await service.delayAfterCommit('REQ-SEM-REGRA');
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('atrasa pelo tempo configurado e consome as tentativas (RP-04/F05)', async () => {
    const service = new SimulationLatencyService();
    service.registerDelay('REQ-TIMEOUT-001', 30, 2);

    const first = Date.now();
    await service.delayAfterCommit('REQ-TIMEOUT-001');
    expect(Date.now() - first).toBeGreaterThanOrEqual(25);

    const second = Date.now();
    await service.delayAfterCommit('REQ-TIMEOUT-001');
    expect(Date.now() - second).toBeGreaterThanOrEqual(25);

    // `times: 2` esgotado — a terceira chamada não atrasa mais.
    const third = Date.now();
    await service.delayAfterCommit('REQ-TIMEOUT-001');
    expect(Date.now() - third).toBeLessThan(20);
  });

  it('reset() limpa as regras registradas', async () => {
    const service = new SimulationLatencyService();
    service.registerDelay('REQ-1', 30, 1);
    service.reset();

    const start = Date.now();
    await service.delayAfterCommit('REQ-1');
    expect(Date.now() - start).toBeLessThan(20);
  });
});

describe('validateTimeoutScenarioInput', () => {
  it('aceita requestId com valores padrão de delayMs/times', () => {
    expect(
      validateTimeoutScenarioInput({ requestId: 'REQ-TIMEOUT-001' }),
    ).toEqual({ requestId: 'REQ-TIMEOUT-001', delayMs: 8000, times: 1 });
  });

  it('aceita delayMs/times explícitos dentro dos limites', () => {
    expect(
      validateTimeoutScenarioInput({
        requestId: 'REQ-1',
        delayMs: 500,
        times: 3,
      }),
    ).toEqual({ requestId: 'REQ-1', delayMs: 500, times: 3 });
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { requestId: '' },
    { requestId: 123 },
    { requestId: 'REQ-1', delayMs: 0 },
    { requestId: 'REQ-1', delayMs: -1 },
    { requestId: 'REQ-1', delayMs: 1.5 },
    { requestId: 'REQ-1', delayMs: 999999 },
    { requestId: 'REQ-1', times: 0 },
    { requestId: 'REQ-1', times: 11 },
  ])('recusa entrada inválida: %j', (body) => {
    expect(() => validateTimeoutScenarioInput(body)).toThrow(
      'INVALID_SIMULATION_INPUT',
    );
  });
});

describe('DATA_SCENARIOS', () => {
  const referenceClock = new Date('2026-08-18T14:00:00-03:00');

  it('não inclui timeout-after-commit (é regra de runtime, não fixture)', () => {
    expect(Object.keys(DATA_SCENARIOS)).not.toContain(TIMEOUT_SCENARIO_ID);
  });

  it('behavior-pattern: 9 transações de R$ 4.900 para destinatários distintos, 2 min entre si', () => {
    const build = DATA_SCENARIOS['behavior-pattern']!;
    const { recipients, transactions } = build(referenceClock);

    expect(transactions).toHaveLength(9);
    expect(new Set(recipients.map((r) => r.recipientId)).size).toBe(9);
    expect(transactions.every((t) => t.amountCents === 490000)).toBe(true);
    expect(transactions.every((t) => t.status === 'APPROVED')).toBe(true);
    const gaps = transactions
      .slice(1)
      .map(
        (t, i) =>
          t.createdAt.getTime() - transactions[i]!.createdAt.getTime(),
      );
    expect(gaps.every((gap) => gap === 2 * 60 * 1000)).toBe(true);
  });

  it('stale-review: uma REVIEW criada exatamente 25h antes do relógio de referência', () => {
    const build = DATA_SCENARIOS['stale-review']!;
    const { transactions } = build(referenceClock);

    expect(transactions).toHaveLength(1);
    const [transaction] = transactions;
    expect(transaction!.status).toBe('REVIEW');
    expect(referenceClock.getTime() - transaction!.createdAt.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
  });

  it('duplicate-retry: duas transações de R$ 8.750, mesmo destinatário, requestId distintos, a segundos de distância', () => {
    const build = DATA_SCENARIOS['duplicate-retry']!;
    const { transactions } = build(referenceClock);

    expect(transactions).toHaveLength(2);
    const [first, second] = transactions;
    expect(first!.amountCents).toBe(875000);
    expect(second!.amountCents).toBe(875000);
    expect(first!.recipientSnapshot.recipientId).toBe(
      second!.recipientSnapshot.recipientId,
    );
    expect(first!.requestId).not.toBe(second!.requestId);
    expect(
      Math.abs(second!.createdAt.getTime() - first!.createdAt.getTime()),
    ).toBeLessThanOrEqual(60 * 1000);
  });

  it('new-device-legitimate: uma transação aprovada com deviceId fora do histórico conhecido', () => {
    const build = DATA_SCENARIOS['new-device-legitimate']!;
    const { transactions } = build(referenceClock);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.deviceId).toBe('DEV-NEW-01');
    expect(transactions[0]!.status).toBe('APPROVED');
  });

  it('cada cenário de dados é determinístico (mesma entrada produz a mesma saída)', () => {
    for (const build of Object.values(DATA_SCENARIOS)) {
      const first = build(referenceClock);
      const second = build(referenceClock);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });
});
