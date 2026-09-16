export const PIX_RISK_CONFIG = Symbol('PIX_RISK_CONFIG');
export interface PixRiskConfig {
  readonly reviewAmountCents: number;
}
export function parsePixRiskConfig(
  env: { PIX_REVIEW_AMOUNT_CENTS?: string } = {
    PIX_REVIEW_AMOUNT_CENTS: process.env.PIX_REVIEW_AMOUNT_CENTS,
  },
): PixRiskConfig {
  const raw = env.PIX_REVIEW_AMOUNT_CENTS;
  const value = raw === undefined ? 500000 : Number(raw);
  if (
    (raw !== undefined && !/^[0-9]+$/.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  )
    throw new Error('Configuração de risco inválida.');
  return Object.freeze({ reviewAmountCents: value });
}
