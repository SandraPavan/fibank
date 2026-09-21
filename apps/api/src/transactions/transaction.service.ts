import { Inject, Injectable } from '@nestjs/common';
import type {
  TransactionResponse,
  TransactionPageResponse,
} from '@finbank/contracts';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../repositories/domain.repository';
import type { Transaction } from '../repositories/models';
import { ApiProblem } from '../http/problem';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import {
  TransactionQueryError,
  validateTransactionQuery,
} from './transaction-query.domain';
import {
  PIX_REVIEW_SLA_CONFIG,
  type PixReviewSlaConfig,
} from './pix-review-sla.config';
function project(
  row: Transaction,
  now: Date,
  reviewSlaMs: number,
): TransactionResponse {
  const status = row.status;
  if (
    status !== 'APPROVED' &&
    status !== 'REVIEW' &&
    status !== 'REJECTED' &&
    status !== 'FAILED'
  )
    throw new ApiProblem('PROCESSING_ERROR');
  const ageMs = status === 'REVIEW' ? now.getTime() - row.createdAt.getTime() : null;
  return {
    transactionId: row.transactionId,
    requestId: row.requestId,
    type: 'PIX',
    recipientSnapshot: {
      recipientId: row.recipientSnapshot.recipientId,
      name: row.recipientSnapshot.name,
      pixKeyMasked: row.recipientSnapshot.pixKeyMasked,
      documentMasked: row.recipientSnapshot.documentMasked,
      institution: row.recipientSnapshot.institution,
    },
    amountCents: row.amountCents,
    description: row.description,
    status,
    reasonCodes: [...row.reasonCodes],
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    ageMs,
    slaBreached: ageMs !== null && ageMs > reviewSlaMs,
  };
}
@Injectable()
export class TransactionService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
    @Inject(PERSISTENCE_RUNTIME) private readonly runtime: PersistenceRuntime,
    @Inject(PIX_REVIEW_SLA_CONFIG)
    private readonly slaConfig: PixReviewSlaConfig,
  ) {}
  private async account(profileId: string, workspaceId: string) {
    const account = await this.repository.account(profileId, workspaceId);
    if (!account) throw new ApiProblem('LOCAL_PROFILE_NOT_FOUND');
    return account;
  }
  async list(
    profileId: string,
    entries: Iterable<readonly [string, unknown]>,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<TransactionPageResponse> {
    let query;
    try {
      query = validateTransactionQuery(entries);
    } catch (error) {
      if (error instanceof TransactionQueryError)
        throw new ApiProblem('INVALID_TRANSACTION_QUERY');
      throw error;
    }
    const account = await this.account(profileId, workspaceId);
    const { items, totalItems } = await this.repository.transactionPage(
      account.accountId,
      query,
      workspaceId,
    );
    const now = this.runtime.now();
    return {
      items: items.map((row) => project(row, now, this.slaConfig.reviewSlaMs)),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }
  async get(
    profileId: string,
    transactionId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<TransactionResponse> {
    const account = await this.account(profileId, workspaceId);
    const row = await this.repository.transaction(
      account.accountId,
      transactionId,
      workspaceId,
    );
    if (!row) throw new ApiProblem('TRANSACTION_NOT_FOUND');
    return project(row, this.runtime.now(), this.slaConfig.reviewSlaMs);
  }
}
