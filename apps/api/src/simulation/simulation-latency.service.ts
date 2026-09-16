import { Injectable } from '@nestjs/common';
import type { SimulationLatency } from '../repositories/domain.repository';

interface DelayRule {
  delayMs: number;
  timesRemaining: number;
}

/**
 * Implementação real do simulador de latência (dev/02-arquitetura.md).
 * Estado em memória, por processo — suficiente para o baseline didático;
 * `reset()` limpa as regras junto com `POST /simulation/reset`.
 *
 * A API sempre termina o processamento (débito, persistência da
 * transação) antes de consultar esta regra — só a resposta HTTP atrasa
 * (dev/07-dados-e-cenarios.md, cenário `timeout-after-commit`).
 */
@Injectable()
export class SimulationLatencyService implements SimulationLatency {
  private readonly rules = new Map<string, DelayRule>();

  registerDelay(requestId: string, delayMs: number, times: number): void {
    this.rules.set(requestId, { delayMs, timesRemaining: times });
  }

  async delayAfterCommit(requestId: string): Promise<void> {
    const rule = this.rules.get(requestId);
    if (!rule || rule.timesRemaining <= 0) return;
    rule.timesRemaining -= 1;
    if (rule.timesRemaining <= 0) this.rules.delete(requestId);
    await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
  }

  reset(): void {
    this.rules.clear();
  }
}
