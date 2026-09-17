import { Inject, Injectable } from '@nestjs/common';
import type {
  TransactionResponse,
  TransactionPageResponse,
} from '@finbank/contracts';
import { DomainRepository } from '../repositories/domain.repository';
import type { Transaction } from '../repositories/models';
import { ApiProblem } from '../http/problem';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import {
  TransactionQueryError,
  validateTransactionQuery,
} from './transaction-query.domain';
function project(row: Transaction): TransactionResponse {
  const status = row.status;
  if (
    status !== 'APPROVED' &&
    status !== 'REVIEW' &&
    status !== 'REJECTED' &&
    status !== 'FAILED'
  )
    throw new ApiProblem('PROCESSING_ERROR');
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
  };
}
@Injectable()
export class TransactionService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
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
    return {
      items: items.map(project),
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
    return project(row);
  }
}
