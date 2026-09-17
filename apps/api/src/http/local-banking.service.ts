import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  AccountResponse,
  ProfileResponse,
  RecipientResponse,
} from '@finbank/contracts';
import { DomainRepository } from '../repositories/domain.repository';
import type { Account, Recipient } from '../repositories/models';
import { validateRegistration } from '../database/password';
import { ApiProblem } from './problem';
import { pixKey } from './local-profile.context';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
export function publicAccount(account: Account): AccountResponse {
  return {
    accountId: account.accountId,
    profileId: account.profileId,
    ownerName: account.ownerName,
    documentMasked: account.documentMasked,
    balanceCents: account.balanceCents,
    dailyLimitCents: account.dailyLimitCents,
  };
}
export function publicRecipient(recipient: Recipient): RecipientResponse {
  return {
    recipientId: recipient.recipientId,
    name: recipient.name,
    pixKeyMasked: recipient.pixKeyMasked,
    documentMasked: recipient.documentMasked,
    institution: recipient.institution,
  };
}
@Injectable()
export class LocalBankingService {
  constructor(
    @Inject(DomainRepository) private readonly repository: DomainRepository,
  ) {}
  async register(
    body: unknown,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<ProfileResponse> {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'displayName') ||
      !Object.hasOwn(body, 'transactionPassword')
    )
      throw new ApiProblem('INVALID_PROFILE_INPUT');
    const input = body as Record<string, unknown>;
    try {
      validateRegistration(input.displayName, input.transactionPassword);
    } catch {
      throw new ApiProblem('INVALID_PROFILE_INPUT');
    }
    const { profile, account } = await this.repository.register(
      input.displayName,
      input.transactionPassword,
      workspaceId,
    );
    return {
      profileId: profile.profileId,
      displayName: profile.displayName,
      accountId: account.accountId,
    };
  }
  async profiles(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<ProfileResponse[]> {
    const profiles = await this.repository.profiles(workspaceId);
    return Promise.all(
      profiles.map(async (profile) => {
        const account = await this.repository.account(
          profile.profileId,
          workspaceId,
        );
        if (!account) throw new ApiProblem('PROCESSING_ERROR');
        return {
          profileId: profile.profileId,
          displayName: profile.displayName,
          accountId: account.accountId,
        };
      }),
    );
  }
  async account(
    profileId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<AccountResponse> {
    const account = await this.repository.account(profileId, workspaceId);
    if (!account) throw new ApiProblem('LOCAL_PROFILE_NOT_FOUND');
    return publicAccount(account);
  }
  async resolve(
    query: Record<string, unknown>,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<RecipientResponse> {
    const hash = createHash('sha256').update(pixKey(query)).digest('hex');
    const recipient = await this.repository.recipientByHash(hash, workspaceId);
    if (!recipient) throw new ApiProblem('RECIPIENT_NOT_FOUND');
    return publicRecipient(recipient);
  }
  async frequent(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<RecipientResponse[]> {
    return (await this.repository.recipients(workspaceId)).map(publicRecipient);
  }
}
