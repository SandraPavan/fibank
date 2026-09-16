/**
 * `FIXED_CLOCK` (dev/02-arquitetura.md): relógio congelado opcional para
 * testes e para a revelação didática. Não é exclusivo do
 * `SimulationModule` — qualquer código que use `PersistenceRuntime.now()`
 * passa a ser determinístico quando essa variável está definida (RNF-02).
 */
export function parseFixedClock(
  env: { FIXED_CLOCK?: string } = { FIXED_CLOCK: process.env.FIXED_CLOCK },
): Date | undefined {
  if (env.FIXED_CLOCK === undefined) return undefined;
  const parsed = new Date(env.FIXED_CLOCK);
  if (Number.isNaN(parsed.getTime()))
    throw new Error('FIXED_CLOCK deve ser uma data ISO 8601 válida.');
  return parsed;
}
