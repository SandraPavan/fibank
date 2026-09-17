import 'reflect-metadata';
import { afterAll, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';
import { initialize, reset, seed } from '../src/database/seed';
import {
  BASE_PASSWORD,
  recipients,
  transactions,
} from '../src/database/fixtures';
import { verifyPassword } from '../src/database/password';
import { DomainRepository } from '../src/repositories/domain.repository';
import { DEFAULT_WORKSPACE_ID } from '../src/workspace/workspace-context';

const db = new PrismaService();
const environment = {
  WORKSHOP_MODE: 'true',
  DATABASE_URL: process.env.DATABASE_URL,
};
afterAll(() => db.$disconnect());
it('persiste os cinco modelos, isola contas e converge seed/reset no replica set', async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Integração exige finbank_test.');
  await reset(db, environment);
  let sequence = 2000;
  const now = new Date('2026-08-18T16:00:00Z');
  const repository = new DomainRepository(db, {
    now: () => now,
    id: (prefix) => `${prefix}-${++sequence}`,
  });
  const first = await repository.register('  Pessoa Exemplo  ', '012345');
  const second = await repository.register('Pessoa Exemplo', '654321');
  expect(first.profile.profileId).not.toBe(second.profile.profileId);
  expect(first.account.accountId).not.toBe(second.account.accountId);
  expect(first.profile.displayName).toBe('Pessoa Exemplo');
  expect(first.account.balanceCents).toBe(14525000);
  expect(first.account.dailyLimitCents).toBe(10000000);
  expect(
    await verifyPassword('012345', first.account.transactionPasswordHash),
  ).toBe(true);
  expect(await repository.transactions(first.account.accountId)).toEqual([]);
  // A collision in the second write must roll back the profile as well.
  const colliding = new DomainRepository(db, {
    now: () => now,
    id: (prefix) =>
      prefix === 'ACC' ? first.account.accountId : 'PRO-ROLLBACK',
  });
  await expect(colliding.register('Outro Exemplo', '123456')).rejects.toThrow();
  expect(
    await db.localProfile.findUnique({
      where: {
        workspaceId_profileId: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          profileId: 'PRO-ROLLBACK',
        },
      },
    }),
  ).toBeNull();
  const base = (await repository.account('PRO-1001'))!;
  const hash = base.transactionPasswordHash;
  await repository.saveAccount({ ...base, balanceCents: 1 });
  await initialize(db);
  expect((await repository.account('PRO-1001'))!.balanceCents).toBe(1);
  const recipient = recipients[0]!;
  await repository.saveRecipient({ ...recipient, name: 'Nome Alterado' });
  const input = {
    requestId: 'REQ-2001',
    accountId: first.account.accountId,
    recipientId: recipient.recipientId,
    amountCents: 1234,
    description: 'Teste fictício',
    deviceId: 'DEV-2001',
    state: 'DRAFT' as const,
    expiresAt: new Date('2026-08-18T16:05:00Z'),
  };
  const intent = await repository.createIntent(input);
  expect(intent.createdAt).toEqual(now);
  expect(
    await repository.intents(second.account.accountId, input.requestId),
  ).toEqual([]);
  expect(
    await repository.updateIntent(second.account.accountId, intent.intentId, {
      amountCents: 999,
      description: '',
      state: 'AUTH_PENDING',
    }),
  ).toBe(0);
  expect(
    await repository.updateIntent(first.account.accountId, intent.intentId, {
      amountCents: 2345,
      description: 'Descrição editada',
      state: 'AUTH_PENDING',
    }),
  ).toBe(1);
  expect(
    await repository.intents(first.account.accountId, input.requestId),
  ).toEqual([
    {
      ...intent,
      amountCents: 2345,
      description: 'Descrição editada',
      state: 'AUTH_PENDING',
    },
  ]);
  const {
    transactionId: _id,
    createdAt: _created,
    updatedAt: _updated,
    ...transaction
  } = transactions[0]!;
  void _id;
  void _created;
  void _updated;
  const repeated = {
    ...transaction,
    requestId: input.requestId,
    accountId: first.account.accountId,
    riskScore: null,
    processedAt: null,
  };
  const persisted = await repository.createTransaction(repeated);
  // DEV-100: `requestId` agora é único por conta, então a segunda escrita
  // de teste (mesmos dados, propósito de gerar um segundo `transactionId`
  // independente) precisa de um `requestId` distinto do primeiro.
  await repository.createTransaction({ ...repeated, requestId: 'REQ-2002' });
  expect(
    await repository.transaction(
      first.account.accountId,
      persisted.transactionId,
    ),
  ).toEqual(persisted);
  expect(
    await repository.transaction(
      second.account.accountId,
      persisted.transactionId,
    ),
  ).toBeNull();
  expect(await repository.transactions(first.account.accountId)).toHaveLength(
    2,
  );
  expect(await repository.transactions(second.account.accountId)).toHaveLength(
    0,
  );
  await repository.saveAccount({ ...first.account, balanceCents: 123 });
  await seed(db);
  await seed(db);
  expect(
    (await repository.account(first.profile.profileId))!.balanceCents,
  ).toBe(123);
  expect(
    await repository.intents(first.account.accountId, input.requestId),
  ).toHaveLength(1);
  expect(
    await db.localProfile.count({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
    }),
  ).toBe(3);
  expect(
    await db.account.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(3);
  expect(
    await db.recipient.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(2);
  expect(
    await db.transaction.count({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
    }),
  ).toBe(7);
  expect(
    await db.pixIntent.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(1);
  expect((await repository.account('PRO-1001'))!.balanceCents).toBe(14525000);
  expect((await repository.account('PRO-1001'))!.transactionPasswordHash).toBe(
    hash,
  );
  expect(await verifyPassword(BASE_PASSWORD, hash)).toBe(true);
  expect(
    (await repository.account(first.profile.profileId))!
      .transactionPasswordHash,
  ).toBe(first.account.transactionPasswordHash);
  expect(
    (await repository.transactions(first.account.accountId))[0]!
      .recipientSnapshot.name,
  ).toBe(recipient.name);
  expect((await repository.recipientByHash(recipient.pixKeyHash))!.name).toBe(
    recipient.name,
  );
  await expect(
    reset(db, { ...environment, WORKSHOP_MODE: 'false' }),
  ).rejects.toThrow('Reset não autorizado.');
  expect(
    await db.transaction.count({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
    }),
  ).toBe(7);
  await reset(db, environment);
  expect(
    await db.localProfile.count({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
    }),
  ).toBe(1);
  expect(
    await db.account.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(1);
  expect(
    await db.recipient.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(2);
  expect(
    await db.pixIntent.count({ where: { workspaceId: DEFAULT_WORKSPACE_ID } }),
  ).toBe(0);
  expect(await repository.transactions('ACC-1001')).toHaveLength(5);
  expect(await repository.account(first.profile.profileId)).toBeNull();
}, 30000);
