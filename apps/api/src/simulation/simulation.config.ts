import { ApiProblem } from '../http/problem';

/**
 * Guarda de habilitação do `SimulationModule` (dev/05-controle-didatico.md,
 * dev/02-arquitetura.md). Duas regras distintas, deliberadamente
 * separadas:
 *
 * - `assertSimulationStartupAllowed` roda uma vez, na inicialização do
 *   módulo: falha o processo se `NODE_ENV=production` sem `WORKSHOP_MODE`
 *   explícito. Isso não afeta o resto da API — só o `SimulationModule`.
 * - `assertSimulationEnabled` roda a cada chamada: recusa a operação
 *   (sem derrubar a aplicação) quando `WORKSHOP_MODE` não está ativo,
 *   mesmo fora de produção (ex.: desenvolvimento local comum).
 */
export interface SimulationConfig {
  readonly enabled: boolean;
}

export function parseSimulationConfig(
  env: { WORKSHOP_MODE?: string } = {
    WORKSHOP_MODE: process.env.WORKSHOP_MODE,
  },
): SimulationConfig {
  return Object.freeze({ enabled: env.WORKSHOP_MODE === 'true' });
}

export function assertSimulationStartupAllowed(
  config: SimulationConfig,
  env: { NODE_ENV?: string } = { NODE_ENV: process.env.NODE_ENV },
): void {
  if (!config.enabled && env.NODE_ENV === 'production')
    throw new Error(
      'SimulationModule desabilitado: defina WORKSHOP_MODE=true para habilitá-lo fora de produção.',
    );
}

export function assertSimulationEnabled(config: SimulationConfig): void {
  if (!config.enabled) throw new ApiProblem('SIMULATION_DISABLED');
}
