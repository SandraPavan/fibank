import type { PixRiskConfig } from './pix-risk.config';

export interface PixRiskInput {
  readonly accountId: string;
  readonly amountCents: number;
  readonly deviceId: string;
  readonly knownDeviceIds: readonly string[];
  readonly now: Date;
}
export interface PixRiskDecision {
  readonly status: 'APPROVED' | 'REVIEW';
  readonly riskScore: number;
  readonly reasonCodes: string[];
}
export interface PixRiskHistoryEntry {
  readonly amountCents: number;
  readonly status: string;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
}
export interface PixRiskHistoryReader {
  transactions(accountId: string): Promise<readonly PixRiskHistoryEntry[]>;
}
export const PIX_RISK_HISTORY = Symbol('PIX_RISK_HISTORY');
export interface PixRiskHistoryPort {
  load(
    accountId: string,
    reader: PixRiskHistoryReader,
  ): Promise<readonly PixRiskHistoryEntry[]>;
}
export const transactionRiskHistory: PixRiskHistoryPort = {
  load: (accountId, reader) => reader.transactions(accountId),
};

interface PixRiskSignal {
  readonly reasonCode: string;
  readonly riskScore: number;
}

/**
 * DEV-101 (RF-04/CT27): janela deslizante `[now - windowMs, now]`, fronteira
 * inicial inclusive. Só considera tentativas substantivas (`APPROVED` ou
 * `REVIEW`); `REJECTED`/`FAILED` não compõem frequência nem soma.
 */
function recentHistory(
  history: readonly PixRiskHistoryEntry[],
  now: Date,
  windowMs: number,
): PixRiskHistoryEntry[] {
  const start = now.getTime() - windowMs;
  return history.filter((entry) => {
    const at = (entry.processedAt ?? entry.createdAt).getTime();
    return (
      at >= start &&
      at <= now.getTime() &&
      (entry.status === 'APPROVED' || entry.status === 'REVIEW')
    );
  });
}

function frequencySignal(
  recent: readonly PixRiskHistoryEntry[],
  config: PixRiskConfig,
): PixRiskSignal | null {
  return recent.length >= config.frequencyCountThreshold
    ? { reasonCode: 'FREQUENCY_PATTERN', riskScore: 40 }
    : null;
}

function cumulativeAmountSignal(
  recent: readonly PixRiskHistoryEntry[],
  config: PixRiskConfig,
): PixRiskSignal | null {
  const sum = recent.reduce((total, entry) => total + entry.amountCents, 0);
  return sum >= config.cumulativeAmountCentsThreshold
    ? { reasonCode: 'CUMULATIVE_AMOUNT_PATTERN', riskScore: 40 }
    : null;
}

/**
 * DEV-101 (RF-04/CT29 + RF-03/CT23): dispositivo novo é um sinal, nunca
 * sozinho suficiente para `REVIEW`, mas pesado o bastante para combinar
 * com qualquer um dos outros sinais (40) e cruzar o limiar junto — do
 * contrário "combinar dispositivo" (RF-04) nunca mudaria a decisão de
 * verdade. `parsePixRiskConfig` recusa `reviewRiskScoreThreshold` que
 * não deixe esse peso estritamente abaixo do limiar, para que a garantia
 * acima não dependa só do valor default.
 */
export const NEW_DEVICE_RISK_SCORE = 30;
function newDeviceSignal(input: PixRiskInput): PixRiskSignal | null {
  return input.knownDeviceIds.includes(input.deviceId)
    ? null
    : { reasonCode: 'NEW_DEVICE', riskScore: NEW_DEVICE_RISK_SCORE };
}

export function evaluateCurrentRisk(
  input: PixRiskInput,
  config: PixRiskConfig,
  history: readonly PixRiskHistoryEntry[] = [],
): PixRiskDecision {
  const recent = recentHistory(history, input.now, config.behaviorWindowMs);
  const signals = [
    frequencySignal(recent, config),
    cumulativeAmountSignal(recent, config),
    newDeviceSignal(input),
  ].filter((signal): signal is PixRiskSignal => signal !== null);
  const reasonCodes = signals.map((signal) => signal.reasonCode);
  const behaviorScore = signals.reduce(
    (total, signal) => total + signal.riskScore,
    0,
  );

  if (input.amountCents >= config.reviewAmountCents)
    return {
      status: 'REVIEW',
      riskScore: 80,
      reasonCodes: ['AMOUNT_REQUIRES_REVIEW', ...reasonCodes],
    };
  if (behaviorScore >= config.reviewRiskScoreThreshold)
    return { status: 'REVIEW', riskScore: behaviorScore, reasonCodes };
  return {
    status: 'APPROVED',
    riskScore: 10 + behaviorScore,
    reasonCodes: reasonCodes.length ? reasonCodes : ['WITHIN_CURRENT_RULES'],
  };
}

export class PixRiskEvaluator {
  constructor(
    private readonly config: PixRiskConfig,
    private readonly history: PixRiskHistoryPort,
  ) {}
  async evaluate(
    input: PixRiskInput,
    reader: PixRiskHistoryReader,
  ): Promise<PixRiskDecision> {
    const history = await this.history.load(input.accountId, reader);
    return evaluateCurrentRisk(input, this.config, history);
  }
}
