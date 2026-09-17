import { Inject, Injectable } from '@nestjs/common';
import type { PixConfirmationResponse } from '@finbank/contracts';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  RequestIdConflict,
  SIMULATION_LATENCY,
  noopLatency,
  type PersistenceRuntime,
  type SimulationLatency,
} from '../repositories/domain.repository';
import type { Transaction } from '../repositories/models';
import { retryUntilFound } from './replay-retry';
import { PixRiskEvaluator } from './pix-risk.domain';
import { ApiProblem } from '../http/problem';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import { PixIntentError, validateFunds } from './pix-intent.domain';
import {
  authenticateConfirmation,
  PixConfirmationError,
  validateConfirmable,
  validateConfirmationInput,
} from './pix-confirmation.domain';

/**
 * DEV-100 (RF-05/CT33): repetir a mesma confirmação (mesmo `requestId`)
 * devolve o resultado já persistido em vez de reprocessar.
 */
function confirmationResponse(
  transaction: Transaction,
): PixConfirmationResponse {
  return {
    requestId: transaction.requestId,
    transactionId: transaction.transactionId,
    status: transaction.status as 'APPROVED' | 'REVIEW',
    reasonCodes: transaction.reasonCodes,
    processedAt: (
      transaction.processedAt ?? transaction.updatedAt
    ).toISOString(),
  };
}

@Injectable()
export class PixConfirmationService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
    @Inject(PERSISTENCE_RUNTIME) private readonly runtime: PersistenceRuntime,
    @Inject(PixRiskEvaluator) private readonly risk: PixRiskEvaluator,
    @Inject(SIMULATION_LATENCY)
    private readonly latency: SimulationLatency = noopLatency,
  ) {}
  async confirm(
    profileId: string,
    requestId: string,
    body: unknown,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<PixConfirmationResponse> {
    let result: PixConfirmationResponse;
    try {
      result = await this.repository.confirmation(async (unit) => {
        const account = await unit.account(profileId);
        if (!account) throw new ApiProblem('LOCAL_PROFILE_NOT_FOUND');
        const intent = await unit.intent(account.accountId, requestId);
        if (!intent) throw new ApiProblem('PIX_INTENT_NOT_FOUND');
        const input = validateConfirmationInput(body);
        await authenticateConfirmation(
          input.transactionPassword,
          account.transactionPasswordHash,
        );
        const replay = await unit.transactionByRequestId(
          account.accountId,
          requestId,
        );
        if (replay) return confirmationResponse(replay);
        const now = this.runtime.now();
        validateConfirmable(intent, now);
        const recipient = await unit.recipient(intent.recipientId);
        if (!recipient) throw new ApiProblem('RECIPIENT_NOT_FOUND');
        const transactions = await unit.transactions(account.accountId);
        validateFunds(account, intent.amountCents, transactions, now);
        const decision = await this.risk.evaluate(
          { accountId: account.accountId, amountCents: intent.amountCents },
          {
            transactions: async (requestedAccountId) => {
              if (requestedAccountId !== account.accountId)
                throw new Error('Conta de histórico inválida.');
              return transactions;
            },
          },
        );
        if (intent.state === 'DRAFT')
          await unit.state(intent.intentId, 'AUTH_PENDING');
        await unit.state(intent.intentId, 'PROCESSING');
        if (decision.status === 'APPROVED')
          await unit.debit(account.accountId, intent.amountCents);
        const transactionId = this.runtime.id('TXN');
        const { status, riskScore, reasonCodes } = decision;
        await unit.createTransaction({
          transactionId,
          requestId: intent.requestId,
          accountId: account.accountId,
          recipientSnapshot: {
            recipientId: recipient.recipientId,
            name: recipient.name,
            pixKeyMasked: recipient.pixKeyMasked,
            documentMasked: recipient.documentMasked,
            institution: recipient.institution,
          },
          amountCents: intent.amountCents,
          description: intent.description,
          deviceId: intent.deviceId,
          status,
          riskScore,
          reasonCodes,
          createdAt: now,
          updatedAt: now,
          processedAt: now,
        });
        await unit.state(intent.intentId, status);
        return {
          requestId: intent.requestId,
          transactionId,
          status,
          reasonCodes,
          processedAt: now.toISOString(),
        };
      }, workspaceId);
    } catch (error) {
      const winner =
        error instanceof RequestIdConflict
          ? await this.repository.account(profileId, workspaceId)
          : null;
      const replay =
        winner &&
        (await retryUntilFound(() =>
          this.repository.transactionByRequestId(
            winner.accountId,
            requestId,
            workspaceId,
          ),
        ));
      if (replay) result = confirmationResponse(replay);
      else if (
        error instanceof PixConfirmationError ||
        error instanceof PixIntentError
      )
        throw new ApiProblem(error.code);
      else if (error instanceof ApiProblem) throw error;
      else throw new ApiProblem('PROCESSING_ERROR');
    }
    // A API já terminou o processamento (débito e persistência da
    // transação) neste ponto; um atraso registrado via `SimulationModule`
    // só posterga a resposta HTTP (dev/07-dados-e-cenarios.md).
    await this.latency.delayAfterCommit(requestId);
    return result;
  }
}
