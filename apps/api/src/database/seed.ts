import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { hashPassword, verifyPassword } from './password';
import { DEFAULT_WORKSPACE_ID } from '../workspace/workspace-context';
import {
  BASE_ACCOUNT_ID,
  BASE_PASSWORD,
  BASE_PROFILE_ID,
  recipients,
  transactions,
} from './fixtures';

export function assertResetAllowed(environment: NodeJS.ProcessEnv): void {
  let database: string;
  try {
    database = new URL(environment.DATABASE_URL ?? '').pathname.slice(1);
  } catch {
    throw new Error('Reset não autorizado.');
  }
  if (
    environment.WORKSHOP_MODE !== 'true' ||
    !['finbank', 'finbank_test'].includes(database)
  )
    throw new Error('Reset não autorizado.');
}
/**
 * Restaura a mesma baseline fictícia (perfil, conta, destinatários e
 * histórico) dentro de um único workspace. Todo grupo criado pelo
 * facilitador recebe uma cópia independente desta baseline, isolada pela
 * chave composta `workspaceId_*` (DEV-004) — os IDs de negócio continuam os
 * mesmos de sempre (`PRO-1001`, `ACC-1001`, ...), só deixam de ser globais.
 */
async function restore(
  tx: Prisma.TransactionClient,
  workspaceId: string,
): Promise<void> {
  const existing = await tx.account.findUnique({
    where: {
      workspaceId_accountId: { workspaceId, accountId: BASE_ACCOUNT_ID },
    },
  });
  const transactionPasswordHash =
    existing &&
    (await verifyPassword(BASE_PASSWORD, existing.transactionPasswordHash))
      ? existing.transactionPasswordHash
      : await hashPassword(BASE_PASSWORD);
  const profile = {
    workspaceId,
    profileId: BASE_PROFILE_ID,
    displayName: 'Alex Exemplo',
  };
  await tx.localProfile.upsert({
    where: {
      workspaceId_profileId: { workspaceId, profileId: BASE_PROFILE_ID },
    },
    create: profile,
    update: profile,
  });
  const account = {
    workspaceId,
    accountId: BASE_ACCOUNT_ID,
    profileId: BASE_PROFILE_ID,
    ownerName: profile.displayName,
    documentMasked: '***.123.456-**',
    balanceCents: 14525000,
    dailyLimitCents: 10000000,
    transactionPasswordHash,
    knownDeviceIds: ['DEV-1001'],
  };
  await tx.account.upsert({
    where: {
      workspaceId_accountId: { workspaceId, accountId: BASE_ACCOUNT_ID },
    },
    create: account,
    update: account,
  });
  for (const recipient of recipients)
    await tx.recipient.upsert({
      where: {
        workspaceId_recipientId: {
          workspaceId,
          recipientId: recipient.recipientId,
        },
      },
      create: { ...recipient, workspaceId },
      update: { ...recipient, workspaceId },
    });
  for (const transaction of transactions)
    await tx.transaction.upsert({
      where: {
        workspaceId_transactionId: {
          workspaceId,
          transactionId: transaction.transactionId,
        },
      },
      create: { ...transaction, workspaceId },
      update: { ...transaction, workspaceId },
    });
}
export async function seed(
  db: PrismaService,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  await db.$transaction((tx) => restore(tx, workspaceId));
}
export async function initialize(
  db: PrismaService,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  await db.$transaction(async (tx) => {
    if (
      !(await tx.localProfile.findUnique({
        where: {
          workspaceId_profileId: { workspaceId, profileId: BASE_PROFILE_ID },
        },
      }))
    )
      await restore(tx, workspaceId);
  });
}
export async function reset(
  db: PrismaService,
  environment: NodeJS.ProcessEnv,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  assertResetAllowed(environment);
  if (!db.usesConnection(environment.DATABASE_URL))
    throw new Error('Reset não autorizado.');
  await db.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { workspaceId } });
    await tx.pixIntent.deleteMany({ where: { workspaceId } });
    await tx.account.deleteMany({ where: { workspaceId } });
    await tx.localProfile.deleteMany({ where: { workspaceId } });
    await tx.recipient.deleteMany({ where: { workspaceId } });
    await restore(tx, workspaceId);
  });
}
