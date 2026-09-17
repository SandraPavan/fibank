import type { Prisma } from '@prisma/client';
import type { TransactionQuery } from '../transactions/transaction-query.domain';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { hashPassword, validateRegistration } from '../database/password';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import type {
  Account,
  LocalProfile,
  PixIntent,
  Recipient,
  Transaction,
} from './models';

export interface ConfirmationUnit {
  account(profileId: string): Promise<Account | null>;
  intent(accountId: string, requestId: string): Promise<PixIntent | null>;
  recipient(recipientId: string): Promise<Recipient | null>;
  transactions(accountId: string): Promise<Transaction[]>;
  state(intentId: string, state: PixIntent['state']): Promise<void>;
  debit(accountId: string, amountCents: number): Promise<void>;
  createTransaction(transaction: Transaction): Promise<void>;
}

export const PERSISTENCE_RUNTIME = Symbol('PERSISTENCE_RUNTIME');
export interface PersistenceRuntime {
  now(): Date;
  id(prefix: string): string;
}
export const defaultRuntime: PersistenceRuntime = {
  now: () => new Date(),
  id: (prefix) => `${prefix}-${randomUUID()}`,
};

/**
 * Simulador de latência (dev/02-arquitetura.md: "relógio, gerador de IDs
 * e simulador de latência devem ser injetáveis"). Implementado pelo
 * `SimulationModule`; por padrão é um no-op — nenhum comportamento muda
 * quando nenhum cenário de atraso foi registrado.
 */
export const SIMULATION_LATENCY = Symbol('SIMULATION_LATENCY');
export interface SimulationLatency {
  delayAfterCommit(requestId: string): Promise<void>;
}
export const noopLatency: SimulationLatency = {
  delayAfterCommit: async () => {},
};

function withoutPhysicalId<T extends { id: string; workspaceId: string }>(
  record: T,
): Omit<T, 'id' | 'workspaceId'> {
  const { id, workspaceId, ...domain } = record;
  void id;
  void workspaceId;
  return domain;
}

/**
 * Todo acesso a `Account`, `Recipient`, `PixIntent` e `Transaction` passa por
 * aqui e é filtrado por `workspaceId` (DEV-004: "toda consulta e escrita de
 * repository exige o contexto do workspace"). Cada método recebe o
 * `workspaceId` como último parâmetro, explícito — nunca de um campo enviado
 * pelo cliente — com o mesmo padrão já usado pelo terceiro parâmetro do
 * construtor (`PERSISTENCE_RUNTIME`): um default (`DEFAULT_WORKSPACE_ID`)
 * que preserva o comportamento de instância única de G1–G4 para todo
 * chamador que ainda não passa workspace (inclusive os testes existentes).
 * Controllers derivam o valor real da sessão via
 * `workspaceIdFromRequest(request)` e repassam explicitamente.
 */
@Injectable()
export class DomainRepository {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PERSISTENCE_RUNTIME)
    private readonly runtime: PersistenceRuntime = defaultRuntime,
  ) {}

  async confirmation<T>(
    action: (unit: ConfirmationUnit) => Promise<T>,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<T> {
    return this.db.$transaction(async (tx) =>
      action({
        account: async (profileId) => {
          const row = await tx.account.findUnique({
            where: { workspaceId_profileId: { workspaceId, profileId } },
          });
          return row && withoutPhysicalId(row);
        },
        intent: async (accountId, requestId) => {
          const row = await tx.pixIntent.findFirst({
            where: { workspaceId, accountId, requestId },
            orderBy: [{ createdAt: 'asc' }, { intentId: 'asc' }],
          });
          return row && withoutPhysicalId(row);
        },
        recipient: async (recipientId) => {
          const row = await tx.recipient.findUnique({
            where: { workspaceId_recipientId: { workspaceId, recipientId } },
          });
          return row && withoutPhysicalId(row);
        },
        transactions: async (accountId) =>
          (
            await tx.transaction.findMany({ where: { workspaceId, accountId } })
          ).map(withoutPhysicalId),
        state: async (intentId, state) => {
          await tx.pixIntent.update({
            where: { workspaceId_intentId: { workspaceId, intentId } },
            data: { state },
          });
        },
        debit: async (accountId, amountCents) => {
          await tx.account.update({
            where: { workspaceId_accountId: { workspaceId, accountId } },
            data: { balanceCents: { decrement: amountCents } },
          });
        },
        createTransaction: async (transaction) => {
          await tx.transaction.create({
            data: { ...transaction, workspaceId },
          });
        },
      }),
    );
  }

  async register(
    displayName: unknown,
    password: unknown,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<{ profile: LocalProfile; account: Account }> {
    const name = validateRegistration(displayName, password);
    const transactionPasswordHash = await hashPassword(password as string);
    const profile = { profileId: this.runtime.id('PRO'), displayName: name };
    const account: Account = {
      accountId: this.runtime.id('ACC'),
      profileId: profile.profileId,
      ownerName: name,
      documentMasked: '***.***.***-**',
      balanceCents: 14525000,
      dailyLimitCents: 10000000,
      transactionPasswordHash,
      knownDeviceIds: [],
    };
    await this.db.$transaction(async (tx) => {
      await tx.localProfile.create({ data: { ...profile, workspaceId } });
      await tx.account.create({ data: { ...account, workspaceId } });
    });
    return { profile, account };
  }
  async profiles(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<LocalProfile[]> {
    return this.db.localProfile
      .findMany({ where: { workspaceId }, orderBy: { profileId: 'asc' } })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async account(
    profileId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Account | null> {
    return this.db.account
      .findUnique({
        where: { workspaceId_profileId: { workspaceId, profileId } },
      })
      .then((row) => row && withoutPhysicalId(row));
  }
  async saveAccount(
    account: Account,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<void> {
    await this.db.account.update({
      where: {
        workspaceId_accountId: { workspaceId, accountId: account.accountId },
      },
      data: account,
    });
  }
  async recipients(
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Recipient[]> {
    return this.db.recipient
      .findMany({ where: { workspaceId }, orderBy: { recipientId: 'asc' } })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async recipient(
    recipientId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Recipient | null> {
    return this.db.recipient
      .findUnique({
        where: { workspaceId_recipientId: { workspaceId, recipientId } },
      })
      .then((row) => row && withoutPhysicalId(row));
  }
  async editIntent(
    accountId: string,
    intentId: string,
    changes: Partial<
      Pick<
        PixIntent,
        'recipientId' | 'amountCents' | 'description' | 'deviceId'
      >
    >,
    now: Date,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<number> {
    return (
      await this.db.pixIntent.updateMany({
        where: {
          workspaceId,
          accountId,
          intentId,
          state: { in: ['DRAFT', 'AUTH_PENDING'] },
          expiresAt: { gt: now },
        },
        data: changes,
      })
    ).count;
  }
  async recipientByHash(
    pixKeyHash: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Recipient | null> {
    return this.db.recipient
      .findFirst({ where: { workspaceId, pixKeyHash } })
      .then((row) => row && withoutPhysicalId(row));
  }
  async saveRecipient(
    recipient: Recipient,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<void> {
    await this.db.recipient.upsert({
      where: {
        workspaceId_recipientId: {
          workspaceId,
          recipientId: recipient.recipientId,
        },
      },
      create: { ...recipient, workspaceId },
      update: { ...recipient, workspaceId },
    });
  }
  async createIntent(
    input: Omit<PixIntent, 'intentId' | 'createdAt'> & { createdAt?: Date },
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<PixIntent> {
    return this.db.pixIntent
      .create({
        data: {
          ...input,
          workspaceId,
          intentId: this.runtime.id('INT'),
          createdAt: input.createdAt ?? this.runtime.now(),
        },
      })
      .then(withoutPhysicalId);
  }
  async intents(
    accountId: string,
    requestId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<PixIntent[]> {
    return this.db.pixIntent
      .findMany({
        where: { workspaceId, accountId, requestId },
        orderBy: [{ createdAt: 'asc' }, { intentId: 'asc' }],
      })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async updateIntent(
    accountId: string,
    intentId: string,
    changes: Pick<PixIntent, 'amountCents' | 'description' | 'state'>,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<number> {
    return (
      await this.db.pixIntent.updateMany({
        where: { workspaceId, accountId, intentId },
        data: changes,
      })
    ).count;
  }
  async createTransaction(
    input: Omit<Transaction, 'transactionId' | 'createdAt' | 'updatedAt'>,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Transaction> {
    const now = this.runtime.now();
    return this.db.transaction
      .create({
        data: {
          ...input,
          workspaceId,
          transactionId: this.runtime.id('TXN'),
          createdAt: now,
          updatedAt: now,
        },
      })
      .then(withoutPhysicalId);
  }
  async transactions(
    accountId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Transaction[]> {
    return this.db.transaction
      .findMany({
        where: { workspaceId, accountId },
        orderBy: [{ createdAt: 'desc' }, { transactionId: 'asc' }],
      })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async transactionPage(
    accountId: string,
    query: TransactionQuery,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<{ items: Transaction[]; totalItems: number }> {
    // Mongo's contains filter uses regex internally; escape every metacharacter.
    const search = query.search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const where: Prisma.TransactionWhereInput = {
      workspaceId,
      accountId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.toExclusive
        ? { createdAt: { gte: query.from, lt: query.toExclusive } }
        : {}),
      ...(search
        ? {
            OR: [
              { transactionId: { contains: search, mode: 'insensitive' } },
              { requestId: { contains: search, mode: 'insensitive' } },
              {
                recipientSnapshot: {
                  is: { name: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    return this.db.$transaction(async (tx) => {
      const totalItems = await tx.transaction.count({ where });
      // Also avoids passing very large, valid offsets to Prisma's Int argument.
      const items =
        query.offset >= totalItems
          ? []
          : await tx.transaction.findMany({
              where,
              orderBy: [{ createdAt: 'desc' }, { transactionId: 'asc' }],
              skip: query.offset,
              take: query.pageSize,
            });
      return { items: items.map(withoutPhysicalId), totalItems };
    });
  }
  async transaction(
    accountId: string,
    transactionId: string,
    workspaceId: string = DEFAULT_WORKSPACE_ID,
  ): Promise<Transaction | null> {
    return this.db.transaction
      .findFirst({ where: { workspaceId, accountId, transactionId } })
      .then((row) => row && withoutPhysicalId(row));
  }
}
