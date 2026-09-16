import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
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
let pixBase: string;
let now: Date;
let profileId: string;

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
  const port = (app.getHttpServer().address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}/api/v1/simulation`;
  pixBase = `http://127.0.0.1:${port}/api/v1/pix/intents`;
});

beforeEach(async () => {
  now = new Date('2026-08-18T15:00:00Z');
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const registered = await repo.register('Pessoa Simulação', '123456');
  profileId = registered.profile.profileId;
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
}

it('recusa reset e aplicação de cenário sem WORKSHOP_MODE=true', async () => {
  vi.stubEnv('WORKSHOP_MODE', 'false');
  try {
    problem(await spec().post(`${base}/reset`), 403, 'SIMULATION_DISABLED');
    problem(
      await spec().post(`${base}/scenarios/stale-review/apply`),
      403,
      'SIMULATION_DISABLED',
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

it('reset restaura as fixtures base depois de apagar dados', async () => {
  await db.transaction.deleteMany();
  await spec().post(`${base}/reset`).expectStatus(200);
  expect(await db.transaction.count()).toBeGreaterThan(0);
});

it.each([
  'behavior-pattern',
  'stale-review',
  'duplicate-retry',
  'new-device-legitimate',
])('aplica o cenário %s de forma idempotente (reaplicar não duplica)', async (scenarioId) => {
  await spec().post(`${base}/scenarios/${scenarioId}/apply`).expectStatus(201);
  const first = await db.transaction.count();
  await spec().post(`${base}/scenarios/${scenarioId}/apply`).expectStatus(201);
  const second = await db.transaction.count();
  expect(second).toBe(first);
});

it('recusa cenário desconhecido sem escrever nada', async () => {
  const before = await db.transaction.count();
  problem(
    await spec().post(`${base}/scenarios/nao-existe/apply`),
    404,
    'SIMULATION_SCENARIO_NOT_FOUND',
  );
  expect(await db.transaction.count()).toBe(before);
});

it('timeout-after-commit: a transação já existe no banco antes da resposta atrasada chegar', async () => {
  const requestId = 'REQ-TIMEOUT-INTEGRATION';
  await spec()
    .post(pixBase)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson({
      requestId,
      recipientId: 'REC-1001',
      amountCents: 100,
      deviceId: 'DEV-timeout',
      description: 'Pagamento fictício',
    })
    .expectStatus(201);

  await spec()
    .post(`${base}/scenarios/timeout-after-commit/apply`)
    .withJson({ requestId, delayMs: 1000, times: 1 })
    .expectStatus(201);

  let responded = false;
  const pending = (async () =>
    spec()
      .post(`${pixBase}/${requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', profileId)
      .withJson({ transactionPassword: '123456' })
      .expectStatus(200))().finally(() => {
    responded = true;
  });

  // Em vez de dormir um tempo fixo e torcer para acertar a janela (o
  // tempo real de verificação de senha + persistência varia demais
  // neste container para um número fixo ser confiável), faz polling até
  // a transação aparecer — provando que o commit aconteceu antes da
  // resposta atrasada — ou até a resposta chegar primeiro, o que
  // reprovaria o teste.
  let committedBeforeResponse = false;
  while (!responded) {
    if (await db.transaction.findFirst({ where: { requestId } })) {
      committedBeforeResponse = true;
      break;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 20));
  }
  expect(committedBeforeResponse).toBe(true);

  await pending;
});
