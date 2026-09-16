import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { hashPassword, verifyPassword } from './password';
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
async function restore(tx: Prisma.TransactionClient): Promise<void> {
  const existing = await tx.account.findUnique({
    where: { accountId: BASE_ACCOUNT_ID },
  });
  const transactionPasswordHash =
    existing &&
    (await verifyPassword(BASE_PASSWORD, existing.transactionPasswordHash))
      ? existing.transactionPasswordHash
      : await hashPassword(BASE_PASSWORD);
  const profile = { profileId: BASE_PROFILE_ID, displayName: 'Alex Exemplo' };
  await tx.localProfile.upsert({
    where: { profileId: BASE_PROFILE_ID },
    create: profile,
    update: profile,
  });
  const account = {
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
    where: { accountId: BASE_ACCOUNT_ID },
    create: account,
    update: account,
  });
  for (const recipient of recipients)
    await tx.recipient.upsert({
      where: { recipientId: recipient.recipientId },
      create: recipient,
      update: recipient,
    });
  for (const transaction of transactions)
    await tx.transaction.upsert({
      where: { transactionId: transaction.transactionId },
      create: transaction,
      update: transaction,
    });
}
export async function seed(db: PrismaService): Promise<void> {
  await db.$transaction(restore);
}
export async function initialize(db: PrismaService): Promise<void> {
  await db.$transaction(async (tx) => {
    if (
      !(await tx.localProfile.findUnique({
        where: { profileId: BASE_PROFILE_ID },
      }))
    )
      await restore(tx);
  });
}
export async function reset(
  db: PrismaService,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  assertResetAllowed(environment);
  if (!db.usesConnection(environment.DATABASE_URL))
    throw new Error('Reset não autorizado.');
  await db.$transaction(async (tx) => {
    await tx.transaction.deleteMany();
    await tx.pixIntent.deleteMany();
    await tx.account.deleteMany();
    await tx.localProfile.deleteMany();
    await tx.recipient.deleteMany();
    await restore(tx);
  });
}
