import { NEW_DEVICE_RISK_SCORE } from './pix-risk.domain';

export const PIX_RISK_CONFIG = Symbol('PIX_RISK_CONFIG');
export interface PixRiskConfig {
  readonly reviewAmountCents: number;
  readonly behaviorWindowMs: number;
  readonly frequencyCountThreshold: number;
  readonly cumulativeAmountCentsThreshold: number;
  readonly reviewRiskScoreThreshold: number;
}
function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (raw !== undefined && !/^[0-9]+$/.test(raw)) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  )
    throw new Error('Configuração de risco inválida.');
  return value;
}
export function parsePixRiskConfig(
  env: {
    PIX_REVIEW_AMOUNT_CENTS?: string;
    PIX_BEHAVIOR_WINDOW_MS?: string;
    PIX_BEHAVIOR_FREQUENCY_THRESHOLD?: string;
    PIX_BEHAVIOR_CUMULATIVE_AMOUNT_CENTS?: string;
    PIX_BEHAVIOR_REVIEW_SCORE_THRESHOLD?: string;
  } = {
    PIX_REVIEW_AMOUNT_CENTS: process.env.PIX_REVIEW_AMOUNT_CENTS,
    PIX_BEHAVIOR_WINDOW_MS: process.env.PIX_BEHAVIOR_WINDOW_MS,
    PIX_BEHAVIOR_FREQUENCY_THRESHOLD: process.env.PIX_BEHAVIOR_FREQUENCY_THRESHOLD,
    PIX_BEHAVIOR_CUMULATIVE_AMOUNT_CENTS:
      process.env.PIX_BEHAVIOR_CUMULATIVE_AMOUNT_CENTS,
    PIX_BEHAVIOR_REVIEW_SCORE_THRESHOLD:
      process.env.PIX_BEHAVIOR_REVIEW_SCORE_THRESHOLD,
  },
): PixRiskConfig {
  return Object.freeze({
    reviewAmountCents: parsePositiveInteger(env.PIX_REVIEW_AMOUNT_CENTS, 500000),
    // DEV-101 (RF-04): janela deslizante para frequência/soma recentes.
    behaviorWindowMs: parsePositiveInteger(
      env.PIX_BEHAVIOR_WINDOW_MS,
      30 * 60 * 1000,
    ),
    frequencyCountThreshold: parsePositiveInteger(
      env.PIX_BEHAVIOR_FREQUENCY_THRESHOLD,
      5,
    ),
    cumulativeAmountCentsThreshold: parsePositiveInteger(
      env.PIX_BEHAVIOR_CUMULATIVE_AMOUNT_CENTS,
      2000000,
    ),
    reviewRiskScoreThreshold: parseReviewRiskScoreThreshold(
      env.PIX_BEHAVIOR_REVIEW_SCORE_THRESHOLD,
    ),
  });
}
// DEV-101 (RF-03/CT23): garante que dispositivo novo sozinho nunca force
// REVIEW, mesmo com o limiar recalibrado via env — não só pelo default.
function parseReviewRiskScoreThreshold(raw: string | undefined): number {
  const value = parsePositiveInteger(raw, 70);
  if (value <= NEW_DEVICE_RISK_SCORE)
    throw new Error('Configuração de risco inválida.');
  return value;
}
