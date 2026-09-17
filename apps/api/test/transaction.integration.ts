import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { TransactionPageResponse } from '@finbank/contracts';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { reset } from '../src/database/seed';
import { transactions } from '../src/database/fixtures';
import { DomainRepository } from '../src/repositories/domain.repository';
import { PixRiskEvaluator } from '../src/pix/pix-risk.domain';
import { DEFAULT_WORKSPACE_ID } from '../src/workspace/workspace-context';
let app: INestApplication;
let db: PrismaService;
let repo: DomainRepository;
let base: string;
let other: string;
settings.setLogLevel('SILENT');
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Integração exige finbank_test.');
  app = await createApiApplication();
  db = app.get(PrismaService);
  repo = app.get(DomainRepository);
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  other = (await repo.register('Outra Pessoa', '123456')).profile.profileId;
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/transactions`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
async function page(
  query = '',
  profile = 'PRO-1001',
): Promise<TransactionPageResponse> {
  return (
    await spec()
      .get(`${base}${query}`)
      .withHeaders('X-Local-Profile-Id', profile)
      .expectStatus(200)
  ).body;
}
async function snapshot() {
  return {
    accounts: await db.account.findMany(),
    intents: await db.pixIntent.findMany(),
    transactions: await db.transaction.findMany(),
    recipients: await db.recipient.findMany(),
  };
}
it('projeta os cinco registros, detalhe e null sem mutação nem avaliação', async () => {
  const before = await snapshot();
  const risk = vi.spyOn(PixRiskEvaluator.prototype, 'evaluate');
  const list = await page();
  expect(list).toMatchObject({
    page: 1,
    pageSize: 20,
    totalItems: 5,
    totalPages: 1,
  });
  expect(list.items.map((item) => item.transactionId)).toEqual([
    'TXN-1005',
    'TXN-1004',
    'TXN-1003',
    'TXN-1001',
    'TXN-1002',
  ]);
  for (const item of list.items) {
    const persisted = transactions.find(
      (row) => row.transactionId === item.transactionId,
    )!;
    expect(item).toEqual({
      transactionId: persisted.transactionId,
      requestId: persisted.requestId,
      type: 'PIX',
      recipientSnapshot: persisted.recipientSnapshot,
      amountCents: persisted.amountCents,
      description: persisted.description,
      status: persisted.status,
      reasonCodes: persisted.reasonCodes,
      createdAt: persisted.createdAt.toISOString(),
      processedAt: persisted.processedAt?.toISOString() ?? null,
    });
    expect(
      (await spec().get(`${base}/${item.transactionId}`).expectStatus(200))
        .body,
    ).toEqual(item);
  }
  expect(await page('', other)).toEqual({
    items: [],
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
  });
  expect(await page('?page=99&pageSize=2')).toEqual({
    items: [],
    page: 99,
    pageSize: 2,
    totalItems: 5,
    totalPages: 3,
  });
  expect(await page('?page=9007199254740991&pageSize=1')).toMatchObject({
    items: [],
    totalItems: 5,
  });
  expect(await snapshot()).toEqual(before);
  expect(risk).not.toHaveBeenCalled();
  risk.mockRestore();
});
it('aplica interseção e busca literal somente nos campos públicos permitidos', async () => {
  expect(
    (
      await page(
        '?from=2026-08-18&to=2026-08-18&status=APPROVED&type=PIX&search=+MARINA+&pageSize=2',
      )
    ).totalItems,
  ).toBe(3);
  expect(
    (await page('?search=req-1002')).items.map((row) => row.transactionId),
  ).toEqual(['TXN-1002']);
  expect((await page('?search=txn-1005')).totalItems).toBe(1);
  for (const search of [
    '.*',
    '[',
    '\\',
    'ma***@example.test',
    '***.111.222-**',
    'DEV-1001',
    'Pagamento fictício',
  ])
    expect(
      (await page(`?search=${encodeURIComponent(search)}`)).totalItems,
    ).toBe(0);
  expect((await page('?status=REJECTED')).totalPages).toBe(0);
  expect((await page('?to=2026-08-17')).totalItems).toBe(1);
  expect((await page('?from=2026-08-18')).totalItems).toBe(4);
});
it('isola contagens e detalhes de contas e conserva snapshot quando destinatário muda', async () => {
  const account = (await repo.account(other))!;
  await db.transaction.create({
    data: {
      ...transactions[0]!,
      workspaceId: DEFAULT_WORKSPACE_ID,
      transactionId: 'TXN-other',
      accountId: account.accountId,
      recipientSnapshot: {
        ...transactions[0]!.recipientSnapshot,
        name: 'Pessoa [A].*',
      },
    },
  });
  expect((await page('?search=Pessoa', other)).totalItems).toBe(1);
  expect((await page('?search=Pessoa')).totalItems).toBe(0);
  expect((await page('?search=%5BA%5D.*', other)).totalItems).toBe(1);
  for (const id of ['TXN-other', 'TXN-missing']) {
    const response = await spec().get(`${base}/${id}`).expectStatus(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(problemBody(response.body)).toMatchObject({
      status: 404,
      code: 'TRANSACTION_NOT_FOUND',
      detail: 'A transação não foi encontrada.',
    });
  }
  const before = (await spec().get(`${base}/TXN-1001`).expectStatus(200)).body;
  await db.recipient.update({
    where: {
      workspaceId_recipientId: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        recipientId: 'REC-1001',
      },
    },
    data: { name: 'Nome atualizado' },
  });
  expect((await spec().get(`${base}/TXN-1001`).expectStatus(200)).body).toEqual(
    before,
  );
  expect((await page('?search=Marina')).totalItems).toBe(5);
});
it('mantém desempate entre páginas e limites exatos do dia civil', async () => {
  for (const [transactionId, at] of [
    ['TXN-edge-a', '2026-08-19T03:00:00Z'],
    ['TXN-edge-b', '2026-08-19T03:00:00Z'],
    ['TXN-edge-before', '2026-08-19T02:59:59.999Z'],
    ['TXN-edge-after', '2026-08-20T03:00:00Z'],
  ]) {
    await db.transaction.create({
      data: {
        ...transactions[0]!,
        workspaceId: DEFAULT_WORKSPACE_ID,
        transactionId: transactionId!,
        // DEV-100: `requestId` agora é único por conta.
        requestId: `REQ-${transactionId!}`,
        createdAt: new Date(at!),
      },
    });
  }
  const first = await page('?from=2026-08-19&to=2026-08-19&pageSize=1');
  const second = await page('?from=2026-08-19&to=2026-08-19&pageSize=1&page=2');
  expect(first.totalItems).toBe(2);
  expect(first.totalPages).toBe(2);
  expect(first.items[0]!.transactionId).toBe('TXN-edge-a');
  expect(second.items[0]!.transactionId).toBe('TXN-edge-b');
});
it('rejeita queries e perfis com erros seguros antes de consultar e não altera dados', async () => {
  const before = await snapshot();
  const read = vi.spyOn(repo, 'transactionPage');
  for (const query of [
    'page=',
    'pageSize=101',
    'page=9007199254740991&pageSize=100',
    'page=1&page=2',
    'search=a&search=a',
    'search[]=a',
    'search[x]=a',
    'unknown=x',
    'from=2026-02-30',
    'to=2026-08-18T03:00:00Z',
    'type=TED',
  ]) {
    const response = await spec().get(`${base}?${query}`).expectStatus(400);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(problemBody(response.body)).toMatchObject({
      code: 'INVALID_TRANSACTION_QUERY',
      status: 400,
    });
  }
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
  for (const path of ['', '/TXN-1001']) {
    for (const [profileId, status, code] of [
      ['bad', 400, 'INVALID_LOCAL_PROFILE'],
      ['PRO-missing', 404, 'LOCAL_PROFILE_NOT_FOUND'],
    ] as const) {
      const response = await spec()
        .get(`${base}${path}`)
        .withHeaders('X-Local-Profile-Id', profileId)
        .expectStatus(status);
      expect(problemBody(response.body).code).toBe(code);
    }
  }
  expect(await snapshot()).toEqual(before);
});
it('oculta falhas do banco no histórico e detalhe', async () => {
  const before = await snapshot();
  const failure = vi
    .spyOn(db.transaction, 'findFirst')
    .mockRejectedValueOnce(new Error('private database message'));
  const detail = await spec().get(`${base}/TXN-1001`).expectStatus(500);
  failure.mockRestore();
  const count = vi
    .spyOn(db, '$transaction')
    .mockRejectedValueOnce(new Error('private database message'));
  const list = await spec().get(base).expectStatus(500);
  count.mockRestore();
  for (const response of [detail, list]) {
    expect(problemBody(response.body).code).toBe('PROCESSING_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(
      'private database message',
    );
  }
  expect(await snapshot()).toEqual(before);
});

function problemBody(body: unknown): Record<string, unknown> {
  return (typeof body === 'string' ? JSON.parse(body) : body) as Record<
    string,
    unknown
  >;
}

it('não expõe estados internos fora do contrato de transação', async () => {
  const original = await db.transaction.findUniqueOrThrow({
    where: {
      workspaceId_transactionId: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        transactionId: 'TXN-1001',
      },
    },
  });
  const where = {
    workspaceId_transactionId: {
      workspaceId: DEFAULT_WORKSPACE_ID,
      transactionId: original.transactionId,
    },
  };
  try {
    for (const status of ['DRAFT', 'AUTH_PENDING', 'PROCESSING'] as const) {
      await db.transaction.update({ where, data: { status } });
      for (const path of ['', '/TXN-1001']) {
        const response = await spec().get(`${base}${path}`).expectStatus(500);
        expect(problemBody(response.body).code).toBe('PROCESSING_ERROR');
        expect(problemBody(response.body).status).toBe(500);
      }
    }
  } finally {
    await db.transaction.update({ where, data: { status: original.status } });
  }
});
