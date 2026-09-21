import { Inject, Injectable } from '@nestjs/common';
import type { PixRequestStatusResponse } from '@finbank/contracts';
import { DomainRepository } from '../repositories/domain.repository';
import { ApiProblem } from '../http/problem';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';

/**
 * DEV-102 (RF-05/RF-06; RP-07/RP-08): consulta somente leitura do
 * resultado de um `requestId`, para o frontend reconciliar antes de
 * repetir uma confirmação após timeout (dev/04-fluxos.md — F05). Nunca
 * escreve nem reprocessa — reaproveita a mesma leitura usada pelo replay
 * de DEV-100 (`DomainRepository.transactionByRequestId`).
 */
@Injectable()
export class PixRequestStatusService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
  ) {}

  async status(
    profileId: string,
    requestId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<PixRequestStatusResponse> {
    const account = await this.repository.account(profileId, workspaceId);
    if (!account) throw new ApiProblem('LOCAL_PROFILE_NOT_FOUND');
    const transaction = await this.repository.transactionByRequestId(
      account.accountId,
      requestId,
      workspaceId,
    );
    if (transaction)
      return {
        requestId,
        status: transaction.status as PixRequestStatusResponse['status'],
        transactionId: transaction.transactionId,
        reasonCodes: transaction.reasonCodes,
        processedAt: (
          transaction.processedAt ?? transaction.updatedAt
        ).toISOString(),
      };
    const intent = (
      await this.repository.intents(account.accountId, requestId, workspaceId)
    )[0];
    if (!intent) throw new ApiProblem('PIX_REQUEST_NOT_FOUND');
    return {
      requestId,
      status: 'PENDING',
      transactionId: null,
      reasonCodes: [],
      processedAt: null,
    };
  }
}
