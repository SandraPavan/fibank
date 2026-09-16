import type { Prisma } from '@prisma/client';
import type { TransactionQuery } from '../transactions/transaction-query.domain';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { hashPassword, validateRegistration } from '../database/password';
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

function withoutPhysicalId<T extends { id: string }>(record: T): Omit<T, 'id'> {
  const { id, ...domain } = record;
  void id;
  return domain;
}

@Injectable()
export class DomainRepository {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PERSISTENCE_RUNTIME)
    private readonly runtime: PersistenceRuntime = defaultRuntime,
  ) {}

  async confirmation<T>(
    action: (unit: ConfirmationUnit) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) =>
      action({
        account: async (profileId) => {
          const row = await tx.account.findUnique({ where: { profileId } });
          return row && withoutPhysicalId(row);
        },
        intent: async (accountId, requestId) => {
          const row = await tx.pixIntent.findFirst({
            where: { accountId, requestId },
            orderBy: [{ createdAt: 'asc' }, { intentId: 'asc' }],
          });
          return row && withoutPhysicalId(row);
        },
        recipient: async (recipientId) => {
          const row = await tx.recipient.findUnique({ where: { recipientId } });
          return row && withoutPhysicalId(row);
        },
        transactions: async (accountId) =>
          (await tx.transaction.findMany({ where: { accountId } })).map(
            withoutPhysicalId,
          ),
        state: async (intentId, state) => {
          await tx.pixIntent.update({ where: { intentId }, data: { state } });
        },
        debit: async (accountId, amountCents) => {
          await tx.account.update({
            where: { accountId },
            data: { balanceCents: { decrement: amountCents } },
          });
        },
        createTransaction: async (transaction) => {
          await tx.transaction.create({ data: transaction });
        },
      }),
    );
  }

  async register(
    displayName: unknown,
    password: unknown,
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
      await tx.localProfile.create({ data: profile });
      await tx.account.create({ data: account });
    });
    return { profile, account };
  }
  async profiles(): Promise<LocalProfile[]> {
    return this.db.localProfile
      .findMany({ orderBy: { profileId: 'asc' } })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async account(profileId: string): Promise<Account | null> {
    return this.db.account
      .findUnique({ where: { profileId } })
      .then((row) => row && withoutPhysicalId(row));
  }
  async saveAccount(account: Account): Promise<void> {
    await this.db.account.update({
      where: { accountId: account.accountId },
      data: account,
    });
  }
  async recipients(): Promise<Recipient[]> {
    return this.db.recipient
      .findMany({ orderBy: { recipientId: 'asc' } })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async recipient(recipientId: string): Promise<Recipient | null> {
    return this.db.recipient
      .findUnique({ where: { recipientId } })
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
  ): Promise<number> {
    return (
      await this.db.pixIntent.updateMany({
        where: {
          accountId,
          intentId,
          state: { in: ['DRAFT', 'AUTH_PENDING'] },
          expiresAt: { gt: now },
        },
        data: changes,
      })
    ).count;
  }
  async recipientByHash(pixKeyHash: string): Promise<Recipient | null> {
    return this.db.recipient
      .findFirst({ where: { pixKeyHash } })
      .then((row) => row && withoutPhysicalId(row));
  }
  async saveRecipient(recipient: Recipient): Promise<void> {
    await this.db.recipient.upsert({
      where: { recipientId: recipient.recipientId },
      create: recipient,
      update: recipient,
    });
  }
  async createIntent(
    input: Omit<PixIntent, 'intentId' | 'createdAt'> & { createdAt?: Date },
  ): Promise<PixIntent> {
    return this.db.pixIntent
      .create({
        data: {
          ...input,
          intentId: this.runtime.id('INT'),
          createdAt: input.createdAt ?? this.runtime.now(),
        },
      })
      .then(withoutPhysicalId);
  }
  async intents(accountId: string, requestId: string): Promise<PixIntent[]> {
    return this.db.pixIntent
      .findMany({
        where: { accountId, requestId },
        orderBy: [{ createdAt: 'asc' }, { intentId: 'asc' }],
      })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async updateIntent(
    accountId: string,
    intentId: string,
    changes: Pick<PixIntent, 'amountCents' | 'description' | 'state'>,
  ): Promise<number> {
    return (
      await this.db.pixIntent.updateMany({
        where: { accountId, intentId },
        data: changes,
      })
    ).count;
  }
  async createTransaction(
    input: Omit<Transaction, 'transactionId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Transaction> {
    const now = this.runtime.now();
    return this.db.transaction
      .create({
        data: {
          ...input,
          transactionId: this.runtime.id('TXN'),
          createdAt: now,
          updatedAt: now,
        },
      })
      .then(withoutPhysicalId);
  }
  async transactions(accountId: string): Promise<Transaction[]> {
    return this.db.transaction
      .findMany({
        where: { accountId },
        orderBy: [{ createdAt: 'desc' }, { transactionId: 'asc' }],
      })
      .then((rows) => rows.map(withoutPhysicalId));
  }
  async transactionPage(
    accountId: string,
    query: TransactionQuery,
  ): Promise<{ items: Transaction[]; totalItems: number }> {
    // Mongo's contains filter uses regex internally; escape every metacharacter.
    const search = query.search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const where: Prisma.TransactionWhereInput = {
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
  ): Promise<Transaction | null> {
    return this.db.transaction
      .findFirst({
        where: { accountId, transactionId },
      })
      .then((row) => row && withoutPhysicalId(row));
  }
}
