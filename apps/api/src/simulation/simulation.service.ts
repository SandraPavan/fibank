import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { reset as resetFixtures } from '../database/seed';
import { ApiProblem } from '../http/problem';
import {
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../repositories/domain.repository';
import {
  assertSimulationEnabled,
  parseSimulationConfig,
} from './simulation.config';
import { DATA_SCENARIOS, TIMEOUT_SCENARIO_ID } from './scenarios';
import { SimulationLatencyService } from './simulation-latency.service';

const DEFAULT_DELAY_MS = 8000;
const MAX_DELAY_MS = 60000;
const DEFAULT_TIMES = 1;
const MAX_TIMES = 10;

interface TimeoutScenarioInput {
  requestId: string;
  delayMs: number;
  times: number;
}

/**
 * `{ requestId, delayMs?, times? }` — corpo aceito por
 * `POST /simulation/scenarios/timeout-after-commit/apply`
 * (dev/07-dados-e-cenarios.md). Limites evitam travar o processo por
 * engano; não têm relação com regra de negócio.
 */
export function validateTimeoutScenarioInput(
  body: unknown,
): TimeoutScenarioInput {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiProblem('INVALID_SIMULATION_INPUT');
  const input = body as Record<string, unknown>;
  if (typeof input.requestId !== 'string' || input.requestId.length === 0)
    throw new ApiProblem('INVALID_SIMULATION_INPUT');
  const delayMs = input.delayMs ?? DEFAULT_DELAY_MS;
  const times = input.times ?? DEFAULT_TIMES;
  if (
    typeof delayMs !== 'number' ||
    !Number.isSafeInteger(delayMs) ||
    delayMs <= 0 ||
    delayMs > MAX_DELAY_MS
  )
    throw new ApiProblem('INVALID_SIMULATION_INPUT');
  if (
    typeof times !== 'number' ||
    !Number.isSafeInteger(times) ||
    times <= 0 ||
    times > MAX_TIMES
  )
    throw new ApiProblem('INVALID_SIMULATION_INPUT');
  return { requestId: input.requestId, delayMs, times };
}

@Injectable()
export class SimulationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SimulationLatencyService)
    private readonly latency: SimulationLatencyService,
    @Inject(PERSISTENCE_RUNTIME)
    private readonly runtime: PersistenceRuntime,
  ) {}

  /**
   * Envelopa `database/seed.ts#reset` (já testado) — não duplica a
   * validação de `WORKSHOP_MODE`/nome do banco, só expõe pela HTTP.
   * Qualquer falha (autorização ou banco errado) responde de forma
   * igualmente opaca: a simulação não deve explicar o motivo
   * (dev/05-controle-didatico.md).
   */
  async reset(): Promise<{ resetAt: string }> {
    this.latency.reset();
    try {
      await resetFixtures(this.db, process.env);
    } catch {
      throw new ApiProblem('SIMULATION_DISABLED');
    }
    return { resetAt: this.runtime.now().toISOString() };
  }

  async applyScenario(
    scenarioId: string,
    body: unknown,
  ): Promise<{ scenarioId: string; appliedAt: string }> {
    assertSimulationEnabled(parseSimulationConfig());

    if (scenarioId === TIMEOUT_SCENARIO_ID) {
      const input = validateTimeoutScenarioInput(body);
      this.latency.registerDelay(input.requestId, input.delayMs, input.times);
    } else {
      const build = DATA_SCENARIOS[scenarioId];
      if (!build) throw new ApiProblem('SIMULATION_SCENARIO_NOT_FOUND');
      const fixture = build(this.runtime.now());
      await this.db.$transaction(async (tx) => {
        for (const recipient of fixture.recipients)
          await tx.recipient.upsert({
            where: { recipientId: recipient.recipientId },
            create: recipient,
            update: recipient,
          });
        for (const transaction of fixture.transactions)
          await tx.transaction.upsert({
            where: { transactionId: transaction.transactionId },
            create: transaction,
            update: transaction,
          });
      });
    }

    return {
      scenarioId,
      appliedAt: this.runtime.now().toISOString(),
    };
  }
}
