import { Inject, Injectable } from '@nestjs/common';
import type { PixIntentResponse } from '@finbank/contracts';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../repositories/domain.repository';
import type { PixIntent } from '../repositories/models';
import { ApiProblem } from '../http/problem';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import {
  PixIntentError,
  validateEditable,
  validateFunds,
  validateIntentInput,
} from './pix-intent.domain';
function publicIntent(intent: PixIntent): PixIntentResponse {
  return {
    requestId: intent.requestId,
    accountId: intent.accountId,
    recipientId: intent.recipientId,
    amountCents: intent.amountCents,
    description: intent.description,
    deviceId: intent.deviceId,
    state: intent.state,
    createdAt: intent.createdAt.toISOString(),
    expiresAt: intent.expiresAt.toISOString(),
  };
}
@Injectable()
export class PixIntentService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
    @Inject(PERSISTENCE_RUNTIME) private readonly runtime: PersistenceRuntime,
  ) {}
  private async account(profileId: string, workspaceId: string) {
    const account = await this.repository.account(profileId, workspaceId);
    if (!account) throw new ApiProblem('LOCAL_PROFILE_NOT_FOUND');
    return account;
  }
  private async find(
    accountId: string,
    requestId: string,
    workspaceId: string,
  ) {
    const intent = (
      await this.repository.intents(accountId, requestId, workspaceId)
    )[0];
    if (!intent) throw new ApiProblem('PIX_INTENT_NOT_FOUND');
    return intent;
  }
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof PixIntentError) throw new ApiProblem(error.code);
      throw error;
    }
  }
  async create(
    profileId: string,
    body: unknown,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ) {
    return this.run(async () => {
      const input = validateIntentInput(body, false);
      const account = await this.account(profileId, workspaceId);
      if (!(await this.repository.recipient(input.recipientId, workspaceId)))
        throw new ApiProblem('RECIPIENT_NOT_FOUND');
      const now = this.runtime.now();
      validateFunds(
        account,
        input.amountCents,
        await this.repository.transactions(account.accountId, workspaceId),
        now,
      );
      return publicIntent(
        await this.repository.createIntent(
          {
            ...input,
            description: input.description ?? '',
            accountId: account.accountId,
            state: 'DRAFT',
            createdAt: now,
            expiresAt: new Date(now.getTime() + 300000),
          },
          workspaceId,
        ),
      );
    });
  }
  async get(
    profileId: string,
    requestId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ) {
    const account = await this.account(profileId, workspaceId);
    return publicIntent(
      await this.find(account.accountId, requestId, workspaceId),
    );
  }
  async update(
    profileId: string,
    requestId: string,
    body: unknown,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ) {
    return this.run(async () => {
      const input = validateIntentInput(body, true);
      const account = await this.account(profileId, workspaceId);
      const intent = await this.find(account.accountId, requestId, workspaceId);
      validateEditable(intent, this.runtime.now());
      const next = { ...intent, ...input };
      if (!(await this.repository.recipient(next.recipientId, workspaceId)))
        throw new ApiProblem('RECIPIENT_NOT_FOUND');
      validateFunds(
        account,
        next.amountCents,
        await this.repository.transactions(account.accountId, workspaceId),
        this.runtime.now(),
      );
      const updated = await this.repository.editIntent(
        account.accountId,
        intent.intentId,
        input,
        this.runtime.now(),
        workspaceId,
      );
      if (!updated) {
        const current = await this.find(
          account.accountId,
          requestId,
          workspaceId,
        );
        validateEditable(current, this.runtime.now());
        throw new ApiProblem('PIX_INTENT_NOT_EDITABLE');
      }
      return publicIntent(
        await this.find(account.accountId, requestId, workspaceId),
      );
    });
  }
}
