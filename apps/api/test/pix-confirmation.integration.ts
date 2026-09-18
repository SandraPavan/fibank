import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { PixRiskEvaluator } from '../src/pix/pix-risk.domain';
import { reset } from '../src/database/seed';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../src/repositories/domain.repository';
import { DEFAULT_WORKSPACE_ID } from '../src/workspace/workspace-context';
let app: INestApplication;
let db: PrismaService;
let repo: DomainRepository;
let base: string;
let now: Date;
let profileId: string;
let accountId: string;
const input = {
  requestId: 'REQ-confirm',
  recipientId: 'REC-1001',
  amountCents: 100,
  deviceId: 'DEV-confirm',
  description: 'Pagamento fictício',
};
const password = { transactionPassword: '123456' };
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
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/pix/intents`;
});
beforeEach(async () => {
  now = new Date('2026-08-18T15:00:00Z');
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const registered = await repo.register('Pessoa Confirmação', '123456');
  profileId = registered.profile.profileId;
  accountId = registered.account.accountId;
  // DEV-101: este arquivo testa a confirmação em si, não o sinal de
  // dispositivo (D05) — registra o dispositivo usado como já conhecido
  // para não introduzir NEW_DEVICE nos testes que não tratam disso.
  await repo.saveAccount({
    ...registered.account,
    knownDeviceIds: [input.deviceId],
  });
  await spec()
    .post(base)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson(input)
    .expectStatus(201);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
function confirm(
  body: object = password,
  profile = profileId,
  requestId = input.requestId,
) {
  return spec()
    .post(`${base}/${requestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', profile)
    .withJson(body);
}
async function snapshot() {
  return {
    accounts: await db.account.findMany(),
    intents: await db.pixIntent.findMany(),
    transactions: await db.transaction.findMany(),
  };
}
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
  expect(JSON.stringify(body)).not.toMatch(
    /123456|654321|scrypt|riskScore|transactionPasswordHash|database-secret/,
  );
}
it('confirma e persiste débito exato, snapshot mascarado e resultado antes da resposta', async () => {
  const before = (await repo.account(profileId))!;
  const baseline = await repo.account('PRO-1001');
  const response = await confirm().expectStatus(200);
  expect(Object.keys(response.body).sort()).toEqual([
    'processedAt',
    'reasonCodes',
    'requestId',
    'status',
    'transactionId',
  ]);
  expect(response.body).toMatchObject({
    requestId: input.requestId,
    status: 'APPROVED',
    reasonCodes: ['WITHIN_CURRENT_RULES'],
    processedAt: now.toISOString(),
  });
  expect(await repo.account(profileId)).toEqual({
    ...before,
    balanceCents: before.balanceCents - input.amountCents,
  });
  expect(await repo.account('PRO-1001')).toEqual(baseline);
  const tx = (await repo.transactions(accountId))[0]!;
  expect(tx).toMatchObject({
    transactionId: response.body.transactionId,
    requestId: input.requestId,
    accountId,
    amountCents: input.amountCents,
    description: input.description,
    deviceId: input.deviceId,
    status: 'APPROVED',
    riskScore: 10,
    processedAt: now,
  });
  expect(tx.recipientSnapshot).toEqual({
    recipientId: 'REC-1001',
    name: 'Marina Exemplo',
    pixKeyMasked: 'ma***@example.test',
    documentMasked: '***.111.222-**',
    institution: 'Banco Exemplo',
  });
  expect((await repo.intents(accountId, input.requestId))[0]?.state).toBe(
    'APPROVED',
  );
  const after = await snapshot();
  // DEV-100/CT33: repetir a mesma confirmação devolve o resultado original,
  // sem nova transação nem novo débito.
  const replay = await confirm().expectStatus(200);
  expect(replay.body).toEqual(response.body);
  expect(await snapshot()).toEqual(after);
});
it('rejeita senha, corpo, JSON e contexto sem mutação ou dados sensíveis', async () => {
  const riskSpy = vi.spyOn(app.get(PixRiskEvaluator), 'evaluate');
  const other = await repo.register('Outra Pessoa', '654321');
  const before = await snapshot();
  for (const body of [
    {},
    { transactionPassword: '654321' },
    { transactionPassword: 123456 },
    { transactionPassword: null },
    { transactionPassword: '12345' },
  ])
    problem(await confirm(body), 422, 'INVALID_TRANSACTION_PASSWORD');
  problem(
    await spec()
      .post(`${base}/${input.requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', profileId),
    422,
    'INVALID_TRANSACTION_PASSWORD',
  );
  for (const body of [
    [],
    { ...password, accountId },
    { ...password, amountCents: 1 },
  ])
    problem(await confirm(body), 400, 'INVALID_PIX_CONFIRMATION');
  problem(
    await spec()
      .post(`${base}/${input.requestId}/confirm`)
      .withHeaders({
        'X-Local-Profile-Id': profileId,
        'Content-Type': 'application/json',
      })
      .withBody('{'),
    400,
    'INVALID_PIX_CONFIRMATION',
  );
  problem(await confirm(password, 'bad'), 400, 'INVALID_LOCAL_PROFILE');
  problem(
    await confirm(password, 'PRO-missing'),
    404,
    'LOCAL_PROFILE_NOT_FOUND',
  );
  problem(
    await confirm({ transactionPassword: '654321' }, other.profile.profileId),
    404,
    'PIX_INTENT_NOT_FOUND',
  );
  problem(
    await confirm(password, profileId, 'REQ-missing'),
    404,
    'PIX_INTENT_NOT_FOUND',
  );
  expect(await snapshot()).toEqual(before);
  expect(riskSpy).not.toHaveBeenCalled();
  riskSpy.mockRestore();
});
it('revalida estados, validade, destinatário, saldo e limite na confirmação', async () => {
  const riskSpy = vi.spyOn(app.get(PixRiskEvaluator), 'evaluate');
  const intent = (await repo.intents(accountId, input.requestId))[0]!;
  for (const state of [
    'PROCESSING',
    'APPROVED',
    'REVIEW',
    'REJECTED',
    'FAILED',
  ] as const) {
    await repo.updateIntent(accountId, intent.intentId, {
      amountCents: 100,
      description: '',
      state,
    });
    const before = await snapshot();
    problem(await confirm(), 409, 'PIX_INTENT_NOT_CONFIRMABLE');
    expect(await snapshot()).toEqual(before);
  }
  await repo.updateIntent(accountId, intent.intentId, {
    amountCents: 100,
    description: '',
    state: 'AUTH_PENDING',
  });
  now = intent.expiresAt;
  let before = await snapshot();
  problem(await confirm(), 410, 'PIX_INTENT_EXPIRED');
  expect(await snapshot()).toEqual(before);
  now = new Date(intent.expiresAt.getTime() - 1);
  const account = (await repo.account(profileId))!;
  for (const [change, code] of [
    [{ balanceCents: 99 }, 'INSUFFICIENT_BALANCE'],
    [{ dailyLimitCents: 99 }, 'DAILY_LIMIT_EXCEEDED'],
  ] as const) {
    await repo.saveAccount({ ...account, ...change });
    before = await snapshot();
    problem(await confirm(), 422, code);
    expect(await snapshot()).toEqual(before);
  }
  await repo.saveAccount(account);
  const recipient = (await repo.recipient(input.recipientId))!;
  await db.recipient.delete({
    where: {
      workspaceId_recipientId: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        recipientId: input.recipientId,
      },
    },
  });
  before = await snapshot();
  problem(await confirm(), 404, 'RECIPIENT_NOT_FOUND');
  expect(await snapshot()).toEqual(before);
  await repo.saveRecipient(recipient);
  expect(riskSpy).not.toHaveBeenCalled();
  await confirm().expectStatus(200);
  expect(riskSpy).toHaveBeenCalledOnce();
  riskSpy.mockRestore();
});
it('restaura gravações reais quando criação de transação falha depois do débito', async () => {
  const existing = (await db.transaction.findFirstOrThrow()).transactionId;
  const runtime = app.get<PersistenceRuntime>(PERSISTENCE_RUNTIME);
  const idSpy = vi.spyOn(runtime, 'id').mockReturnValue(existing);
  const before = await snapshot();
  try {
    problem(await confirm(), 500, 'PROCESSING_ERROR');
    expect(await snapshot()).toEqual(before);
  } finally {
    idSpy.mockRestore();
  }
});
it('revalida a revisão persistida e não escreve a partir de leitura anterior', async () => {
  const run = repo.confirmation.bind(repo);
  const spy = vi
    .spyOn(repo, 'confirmation')
    .mockImplementationOnce(async (action) => {
      const intent = (await repo.intents(accountId, input.requestId))[0]!;
      await repo.editIntent(
        accountId,
        intent.intentId,
        {
          amountCents: 250,
          description: 'Atualizada',
          deviceId: 'DEV-updated',
        },
        now,
      );
      return run(action);
    });
  try {
    await confirm().expectStatus(200);
    expect((await repo.transactions(accountId))[0]).toMatchObject({
      amountCents: 250,
      description: 'Atualizada',
      deviceId: 'DEV-updated',
    });
  } finally {
    spy.mockRestore();
  }
});
it('limite inclusivo soma aprovações no dia de São Paulo e ignora outras contas e dias', async () => {
  now = new Date('2026-08-19T02:59:59.999Z');
  await db.pixIntent.updateMany({
    where: { accountId },
    data: { expiresAt: new Date('2026-08-19T03:05:00Z') },
  });
  const account = (await repo.account(profileId))!;
  await repo.saveAccount({ ...account, dailyLimitCents: 300 });
  const recipient = (await repo.recipient(input.recipientId))!;
  const { pixKeyHash, createdAt, ...recipientSnapshot } = recipient;
  void pixKeyHash;
  void createdAt;
  for (const [amountCents, processedAt] of [
    [200, new Date('2026-08-18T03:00:00Z')],
    [500, new Date('2026-08-18T02:59:59.999Z')],
  ] as const)
    // DEV-100: `requestId` agora é único por conta.
    await repo.createTransaction({
      requestId: `REQ-history-${amountCents}`,
      accountId,
      recipientSnapshot,
      amountCents,
      description: '',
      deviceId: 'DEV-test',
      status: 'APPROVED',
      riskScore: null,
      reasonCodes: [],
      processedAt,
    });
  const intent = (await repo.intents(accountId, input.requestId))[0]!;
  await repo.editIntent(accountId, intent.intentId, { amountCents: 101 }, now);
  const before = await snapshot();
  problem(await confirm(), 422, 'DAILY_LIMIT_EXCEEDED');
  expect(await snapshot()).toEqual(before);
  await repo.editIntent(accountId, intent.intentId, { amountCents: 100 }, now);
  await confirm().expectStatus(200);
});

it.each([499999, 500000, 500001])(
  'persiste decisão no limiar e adjacências: %i',
  async (amountCents) => {
    const intent = (await repo.intents(accountId, input.requestId))[0]!;
    await repo.editIntent(accountId, intent.intentId, { amountCents }, now);
    const before = (await repo.account(profileId))!;
    const baseline = await repo.account('PRO-1001');
    const review = amountCents >= 500000;
    const response = await confirm().expectStatus(review ? 202 : 200);
    const status = review ? 'REVIEW' : 'APPROVED';
    expect(response.body).toEqual({
      requestId: input.requestId,
      transactionId: expect.any(String),
      status,
      reasonCodes: [review ? 'AMOUNT_REQUIRES_REVIEW' : 'WITHIN_CURRENT_RULES'],
      processedAt: now.toISOString(),
    });
    expect(await repo.account(profileId)).toEqual({
      ...before,
      balanceCents: before.balanceCents - (review ? 0 : amountCents),
    });
    expect(await repo.account('PRO-1001')).toEqual(baseline);
    expect(await repo.transactions(accountId)).toHaveLength(1);
    expect((await repo.transactions(accountId))[0]).toMatchObject({
      transactionId: response.body.transactionId,
      status,
      riskScore: review ? 80 : 10,
      amountCents,
      processedAt: now,
      recipientSnapshot: {
        recipientId: 'REC-1001',
        pixKeyMasked: 'ma***@example.test',
        documentMasked: '***.111.222-**',
      },
    });
    expect((await repo.intents(accountId, input.requestId))[0]?.state).toBe(
      status,
    );
    const after = await snapshot();
    // DEV-100/CT33: retry (inclusive de REVIEW) devolve o resultado
    // original com o mesmo status HTTP, sem reprocessar.
    const replay = await confirm().expectStatus(review ? 202 : 200);
    expect(replay.body).toEqual(response.body);
    expect(await snapshot()).toEqual(after);
  },
);
it('REVIEW não consome limite diário nem reserva saldo', async () => {
  const account = (await repo.account(profileId))!;
  await repo.saveAccount({
    ...account,
    balanceCents: 500000,
    dailyLimitCents: 500000,
  });
  const intent = (await repo.intents(accountId, input.requestId))[0]!;
  await repo.editIntent(
    accountId,
    intent.intentId,
    { amountCents: 500000 },
    now,
  );
  await confirm().expectStatus(202);
  await spec()
    .post(base)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson({ ...input, requestId: 'REQ-after-review', amountCents: 499999 })
    .expectStatus(201);
  await confirm(password, profileId, 'REQ-after-review').expectStatus(200);
  expect((await repo.account(profileId))?.balanceCents).toBe(1);
});
it('avalia antes de qualquer escrita financeira e reverte falha do avaliador', async () => {
  const before = await snapshot();
  const risk = app.get(PixRiskEvaluator);
  const spy = vi.spyOn(risk, 'evaluate').mockImplementationOnce(async () => {
    expect(await snapshot()).toEqual(before);
    throw new Error('database-secret');
  });
  try {
    problem(await confirm(), 500, 'PROCESSING_ERROR');
    expect(spy).toHaveBeenCalledOnce();
    expect(await snapshot()).toEqual(before);
  } finally {
    spy.mockRestore();
  }
});
it.each([100, 500000])(
  'reverte transação realmente gravada quando estado final falha: %i',
  async (amountCents) => {
    const intent = (await repo.intents(accountId, input.requestId))[0]!;
    await repo.editIntent(accountId, intent.intentId, { amountCents }, now);
    const before = await snapshot();
    const run = repo.confirmation.bind(repo);
    let wrote = false;
    const spy = vi
      .spyOn(repo, 'confirmation')
      .mockImplementationOnce((action) =>
        run((unit) =>
          action({
            ...unit,
            createTransaction: async (transaction) => {
              await unit.createTransaction(transaction);
              wrote = true;
            },
            state: async (id, state) => {
              await unit.state(id, state);
              if (state === 'APPROVED' || state === 'REVIEW')
                throw new Error('database-secret');
            },
          }),
        ),
      );
    try {
      problem(await confirm(), 500, 'PROCESSING_ERROR');
      expect(wrote).toBe(true);
      expect(await snapshot()).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  },
);

it('conclui avaliação antes de iniciar escritas na unidade transacional', async () => {
  const risk = app.get(PixRiskEvaluator);
  const evaluate = risk.evaluate.bind(risk);
  let evaluated = false;
  const riskSpy = vi
    .spyOn(risk, 'evaluate')
    .mockImplementationOnce(async (...args) => {
      const result = await evaluate(...args);
      evaluated = true;
      return result;
    });
  const run = repo.confirmation.bind(repo);
  const repoSpy = vi
    .spyOn(repo, 'confirmation')
    .mockImplementationOnce((action) =>
      run((unit) =>
        action({
          ...unit,
          state: async (...args) => {
            expect(evaluated).toBe(true);
            await unit.state(...args);
          },
          debit: async (...args) => {
            expect(evaluated).toBe(true);
            await unit.debit(...args);
          },
          createTransaction: async (...args) => {
            expect(evaluated).toBe(true);
            await unit.createTransaction(...args);
          },
        }),
      ),
    );
  try {
    await confirm().expectStatus(200);
    expect(riskSpy).toHaveBeenCalledOnce();
  } finally {
    riskSpy.mockRestore();
    repoSpy.mockRestore();
  }
});

it('aplica limiar do ambiente na confirmação HTTP e nos efeitos persistidos', async () => {
  let configuredApp: INestApplication | undefined;
  vi.stubEnv('PIX_REVIEW_AMOUNT_CENTS', '123');
  try {
    configuredApp = await createApiApplication();
    await configuredApp.listen(0, '127.0.0.1');
    const url = `http://127.0.0.1:${(configuredApp.getHttpServer().address() as AddressInfo).port}/api/v1/pix/intents`;
    const before = (await repo.account(profileId))!;
    for (const [amountCents, status, http, riskScore, reason] of [
      [122, 'APPROVED', 200, 10, 'WITHIN_CURRENT_RULES'],
      [123, 'REVIEW', 202, 80, 'AMOUNT_REQUIRES_REVIEW'],
    ] as const) {
      const requestId = `REQ-configured-${amountCents}`;
      await spec()
        .post(url)
        .withHeaders('X-Local-Profile-Id', profileId)
        .withJson({ ...input, requestId, amountCents })
        .expectStatus(201);
      const response = await spec()
        .post(`${url}/${requestId}/confirm`)
        .withHeaders('X-Local-Profile-Id', profileId)
        .withJson(password)
        .expectStatus(http);
      expect(response.body).toEqual({
        requestId,
        transactionId: expect.any(String),
        status,
        reasonCodes: [reason],
        processedAt: now.toISOString(),
      });
      expect(
        await repo.transaction(accountId, response.body.transactionId),
      ).toMatchObject({
        requestId,
        status,
        riskScore,
        amountCents,
        reasonCodes: [reason],
      });
      expect((await repo.intents(accountId, requestId))[0]?.state).toBe(status);
      expect((await repo.account(profileId))?.balanceCents).toBe(
        before.balanceCents - 122,
      );
    }
  } finally {
    await configuredApp?.close();
    vi.unstubAllEnvs();
  }
});
