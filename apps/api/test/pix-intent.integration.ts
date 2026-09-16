import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { reset } from '../src/database/seed';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../src/repositories/domain.repository';
let app: INestApplication;
let db: PrismaService;
let repo: DomainRepository;
let base: string;
let now = new Date('2026-08-18T15:00:00Z');
settings.setLogLevel('SILENT');
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Integração exige finbank_test.');
  app = await createApiApplication();
  db = app.get(PrismaService);
  repo = app.get(DomainRepository);
  vi.spyOn(
    app.get<PersistenceRuntime>(PERSISTENCE_RUNTIME),
    'now',
  ).mockImplementation(() => now);
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/pix/intents`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
function problem(
  response: {
    statusCode: number;
    headers: Record<string, unknown>;
    body: unknown;
  },
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain(
    'application/problem+json',
  );
  const body =
    typeof response.body === 'string'
      ? JSON.parse(response.body)
      : response.body;
  expect(body).toMatchObject({ status, code });
  expect(Object.keys(body).sort()).toEqual([
    'code',
    'detail',
    'requestId',
    'status',
    'title',
    'traceId',
    'type',
  ]);
}
const input = {
  requestId: 'REQ-create',
  recipientId: 'REC-1001',
  amountCents: 100,
  deviceId: 'DEV-test',
};
async function snapshot() {
  return {
    accounts: await db.account.findMany(),
    intents: await db.pixIntent.findMany(),
    transactions: await db.transaction.findMany(),
  };
}
it('cria, recupera e edita todos os campos permitidos sem efeitos financeiros', async () => {
  const before = await snapshot();
  const created = (await spec().post(base).withJson(input).expectStatus(201))
    .body;
  expect(created).toEqual({
    ...input,
    accountId: 'ACC-1001',
    description: '',
    state: 'DRAFT',
    createdAt: now.toISOString(),
    expiresAt: '2026-08-18T15:05:00.000Z',
  });
  expect(
    (await spec().get(`${base}/${input.requestId}`).expectStatus(200)).body,
  ).toEqual(created);
  const changes = {
    recipientId: 'REC-1002',
    amountCents: 200,
    deviceId: 'DEV-other',
    description: 'Pagamento',
  };
  expect(
    (
      await spec()
        .patch(`${base}/${input.requestId}`)
        .withJson(changes)
        .expectStatus(200)
    ).body,
  ).toEqual({ ...created, ...changes });
  expect(
    (await spec().get(`${base}/${input.requestId}`).expectStatus(200)).body,
  ).toEqual({ ...created, ...changes });
  const after = await snapshot();
  expect(after.accounts).toEqual(before.accounts);
  expect(after.transactions).toEqual(before.transactions);
  expect((await repo.intents('ACC-1001', input.requestId))[0]).toMatchObject(
    changes,
  );
});
it('rejeita entradas e contexto sem qualquer mutação', async () => {
  const { profile } = await repo.register('Outra Pessoa', '123456');
  const before = await snapshot();
  for (const body of [
    {},
    [],
    { ...input, amountCents: 0 },
    { ...input, amountCents: -1 },
    { ...input, amountCents: 1.2 },
    { ...input, amountCents: '100' },
    { ...input, amountCents: 2147483648 },
    { ...input, extra: true },
  ])
    problem(await spec().post(base).withJson(body), 400, 'INVALID_PIX_INTENT');
  problem(
    await spec()
      .post(base)
      .withHeaders('Content-Type', 'application/json')
      .withBody('{'),
    400,
    'INVALID_PIX_INTENT',
  );
  problem(
    await spec()
      .post(base)
      .withJson({ ...input, recipientId: 'REC-missing' }),
    404,
    'RECIPIENT_NOT_FOUND',
  );
  problem(
    await spec()
      .post(base)
      .withJson({ ...input, amountCents: 14525001 }),
    422,
    'INSUFFICIENT_BALANCE',
  );
  for (const body of [
    {},
    { amountCents: 0 },
    { state: 'APPROVED' },
    { accountId: 'ACC-other' },
    { requestId: 'REQ-other' },
    { recipientId: 'REC-missing' },
  ])
    problem(
      await spec().patch(`${base}/${input.requestId}`).withJson(body),
      'recipientId' in body ? 404 : 400,
      'recipientId' in body ? 'RECIPIENT_NOT_FOUND' : 'INVALID_PIX_INTENT',
    );
  for (const requestId of [input.requestId, 'REQ-missing']) {
    problem(
      await spec()
        .get(`${base}/${requestId}`)
        .withHeaders('X-Local-Profile-Id', profile.profileId),
      404,
      'PIX_INTENT_NOT_FOUND',
    );
    problem(
      await spec()
        .patch(`${base}/${requestId}`)
        .withHeaders('X-Local-Profile-Id', profile.profileId)
        .withJson({ amountCents: 100 }),
      404,
      'PIX_INTENT_NOT_FOUND',
    );
  }
  problem(await spec().get(`${base}/REQ-missing`), 404, 'PIX_INTENT_NOT_FOUND');
  problem(
    await spec()
      .get(`${base}/${input.requestId}`)
      .withHeaders('X-Local-Profile-Id', 'bad'),
    400,
    'INVALID_LOCAL_PROFILE',
  );
  problem(
    await spec()
      .get(`${base}/${input.requestId}`)
      .withHeaders('X-Local-Profile-Id', 'PRO-missing'),
    404,
    'LOCAL_PROFILE_NOT_FOUND',
  );
  expect(await snapshot()).toEqual(before);
});
it('limite inclusivo vale em criação e edição e rejeição preserva intenção', async () => {
  const account = (await repo.account('PRO-1001'))!;
  const approved = (await repo.transactions(account.accountId))
    .filter((tx) => tx.status === 'APPROVED')
    .reduce((sum, tx) => sum + tx.amountCents, 0);
  await repo.saveAccount({ ...account, dailyLimitCents: approved + 1000 });
  for (const amountCents of [999, 1000]) {
    await spec()
      .post(base)
      .withJson({
        ...input,
        requestId: `REQ-limit-${amountCents}`,
        amountCents,
      })
      .expectStatus(201);
    await spec()
      .patch(`${base}/${input.requestId}`)
      .withJson({ amountCents })
      .expectStatus(200);
  }
  const before = await snapshot();
  problem(
    await spec()
      .post(base)
      .withJson({ ...input, requestId: 'REQ-limit-over', amountCents: 1001 }),
    422,
    'DAILY_LIMIT_EXCEEDED',
  );
  problem(
    await spec()
      .patch(`${base}/${input.requestId}`)
      .withJson({ amountCents: 1001 }),
    422,
    'DAILY_LIMIT_EXCEEDED',
  );
  expect(await snapshot()).toEqual(before);
  await repo.saveAccount(account);
});
it('bloqueia estados terminais e expiração, permite AUTH_PENDING e consulta expirada', async () => {
  const intent = (await repo.intents('ACC-1001', input.requestId))[0]!;
  await repo.updateIntent(intent.accountId, intent.intentId, {
    amountCents: 100,
    description: '',
    state: 'AUTH_PENDING',
  });
  await spec()
    .patch(`${base}/${input.requestId}`)
    .withJson({ description: 'Revisão' })
    .expectStatus(200);
  for (const state of [
    'PROCESSING',
    'APPROVED',
    'REVIEW',
    'REJECTED',
    'FAILED',
  ] as const) {
    await repo.updateIntent(intent.accountId, intent.intentId, {
      amountCents: 100,
      description: '',
      state,
    });
    const before = await snapshot();
    expect(
      await repo.editIntent(
        intent.accountId,
        intent.intentId,
        { amountCents: 200, description: 'Não gravar' },
        now,
      ),
    ).toBe(0);
    expect(await snapshot()).toEqual(before);
    problem(
      await spec()
        .patch(`${base}/${input.requestId}`)
        .withJson({ amountCents: 200 }),
      409,
      'PIX_INTENT_NOT_EDITABLE',
    );
    expect(await snapshot()).toEqual(before);
  }
  await repo.updateIntent(intent.accountId, intent.intentId, {
    amountCents: 100,
    description: '',
    state: 'DRAFT',
  });
  now = intent.expiresAt;
  const before = await snapshot();
  await spec().get(`${base}/${input.requestId}`).expectStatus(200);
  problem(
    await spec()
      .patch(`${base}/${input.requestId}`)
      .withJson({ amountCents: 200 }),
    410,
    'PIX_INTENT_EXPIRED',
  );
  expect(
    await repo.editIntent(
      intent.accountId,
      intent.intentId,
      {
        amountCents: 200,
        description: '',
        deviceId: 'DEV-test',
        recipientId: 'REC-1001',
      },
      now,
    ),
  ).toBe(0);
  expect(await snapshot()).toEqual(before);
});

it('preserva alterações concorrentes em campos distintos e responde com dados relidos', async () => {
  const requestId = 'REQ-parallel-edit';
  await spec()
    .post(base)
    .withJson({ ...input, requestId })
    .expectStatus(201);
  const read = repo.intents.bind(repo);
  const edit = repo.editIntent.bind(repo);
  let reads = 0;
  let releaseReads!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  let releaseWrites!: () => void;
  const bothWritten = new Promise<void>((resolve) => {
    releaseWrites = resolve;
  });
  let writes = 0;
  const readSpy = vi
    .spyOn(repo, 'intents')
    .mockImplementation(async (accountId, id) => {
      const rows = await read(accountId, id);
      if (id === requestId && reads < 2) {
        reads += 1;
        if (reads === 2) releaseReads();
        await bothRead;
      }
      return rows;
    });
  const editSpy = vi
    .spyOn(repo, 'editIntent')
    .mockImplementation(async (...args) => {
      const count = await edit(...args);
      writes += 1;
      if (writes === 2) releaseWrites();
      await bothWritten;
      return count;
    });
  try {
    const before = await snapshot();
    const responses = await Promise.all([
      spec()
        .patch(`${base}/${requestId}`)
        .withJson({ description: 'Descrição concorrente' })
        .expectStatus(200),
      spec()
        .patch(`${base}/${requestId}`)
        .withJson({ deviceId: 'DEV-concurrent' })
        .expectStatus(200),
    ]);
    expect(reads).toBe(2);
    const persisted = (await read('ACC-1001', requestId))[0]!;
    expect(persisted).toMatchObject({
      description: 'Descrição concorrente',
      deviceId: 'DEV-concurrent',
    });
    for (const response of responses)
      expect(response.body).toMatchObject({
        description: persisted.description,
        deviceId: persisted.deviceId,
      });
    const after = await snapshot();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.transactions).toEqual(before.transactions);
  } finally {
    releaseReads();
    releaseWrites();
    readSpy.mockRestore();
    editSpy.mockRestore();
  }
});

it('recusa edição se o estado muda após validação e antes da escrita condicional', async () => {
  const requestId = 'REQ-state-race';
  await spec()
    .post(base)
    .withJson({ ...input, requestId })
    .expectStatus(201);
  const initial = (await repo.intents('ACC-1001', requestId))[0]!;
  const edit = repo.editIntent.bind(repo);
  const before = await snapshot();
  const spy = vi
    .spyOn(repo, 'editIntent')
    .mockImplementationOnce(async (...args) => {
      await repo.updateIntent(initial.accountId, initial.intentId, {
        amountCents: initial.amountCents,
        description: initial.description,
        state: 'PROCESSING',
      });
      return edit(...args);
    });
  try {
    problem(
      await spec().patch(`${base}/${requestId}`).withJson({
        amountCents: 200,
        description: 'Não gravar',
        deviceId: 'DEV-race',
      }),
      409,
      'PIX_INTENT_NOT_EDITABLE',
    );
    expect(spy).toHaveBeenCalledOnce();
    expect((await repo.intents('ACC-1001', requestId))[0]).toEqual({
      ...initial,
      state: 'PROCESSING',
    });
    const after = await snapshot();
    expect(after.accounts).toEqual(before.accounts);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.intents).toEqual(
      before.intents.map((intent) =>
        intent.intentId === initial.intentId
          ? { ...intent, state: 'PROCESSING' }
          : intent,
      ),
    );
  } finally {
    spy.mockRestore();
  }
});
