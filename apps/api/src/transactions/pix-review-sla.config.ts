export const PIX_REVIEW_SLA_CONFIG = Symbol('PIX_REVIEW_SLA_CONFIG');
export interface PixReviewSlaConfig {
  readonly reviewSlaMs: number;
}
function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^[0-9]+$/.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  )
    throw new Error('Configuração de SLA inválida.');
  return value;
}
/**
 * DEV-103 (F07/GAP08): limiar de idade acima do qual uma transação
 * `REVIEW` é sinalizada como SLA estourado. Default de 24h reaproveita o
 * mesmo valor que já era usado só no cliente (`transactionAnomalies.ts`,
 * removido nesta história).
 */
export function parsePixReviewSlaConfig(
  env: { PIX_REVIEW_SLA_MS?: string } = {
    PIX_REVIEW_SLA_MS: process.env.PIX_REVIEW_SLA_MS,
  },
): PixReviewSlaConfig {
  return Object.freeze({
    reviewSlaMs: parsePositiveInteger(env.PIX_REVIEW_SLA_MS, 24 * 60 * 60 * 1000),
  });
}
