import type { PixRiskConfig } from './pix-risk.config';

export interface PixRiskInput {
  readonly accountId: string;
  readonly amountCents: number;
}
export type PixRiskDecision =
  | { status: 'APPROVED'; riskScore: 10; reasonCodes: ['WITHIN_CURRENT_RULES'] }
  | {
      status: 'REVIEW';
      riskScore: 80;
      reasonCodes: ['AMOUNT_REQUIRES_REVIEW'];
    };
export interface PixRiskHistoryEntry {
  readonly amountCents: number;
  readonly status: string;
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

export function evaluateCurrentRisk(
  input: PixRiskInput,
  config: PixRiskConfig,
): PixRiskDecision {
  return input.amountCents < config.reviewAmountCents
    ? {
        status: 'APPROVED',
        riskScore: 10,
        reasonCodes: ['WITHIN_CURRENT_RULES'],
      }
    : {
        status: 'REVIEW',
        riskScore: 80,
        reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
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
    await this.history.load(input.accountId, reader);
    return evaluateCurrentRisk(input, this.config);
  }
}
