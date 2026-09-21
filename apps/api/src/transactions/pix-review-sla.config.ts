export const PIX_REVIEW_SLA_CONFIG = Symbol('PIX_REVIEW_SLA_CONFIG');
export interface PixReviewSlaConfig {
  readonly reviewSlaMs: number;
}
function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
): number {
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
 * DEV-103 (F07/GAP08, porção facilitador): limiar de idade acima do qual
 * uma transação `REVIEW` é contada como SLA estourado nas métricas do
 * facilitador. Default de 24h.
 */
export function parsePixReviewSlaConfig(
  env: { PIX_REVIEW_SLA_MS?: string } = {
    PIX_REVIEW_SLA_MS: process.env.PIX_REVIEW_SLA_MS,
  },
): PixReviewSlaConfig {
  return Object.freeze({
    reviewSlaMs: parsePositiveInteger(
      env.PIX_REVIEW_SLA_MS,
      24 * 60 * 60 * 1000,
    ),
  });
}
