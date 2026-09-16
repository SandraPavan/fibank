import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { createApiApplication } from '../../../apps/api/src/bootstrap';
import { PrismaService } from '../../../apps/api/src/database/prisma.service';
import { reset } from '../../../apps/api/src/database/seed';
import {
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../../../apps/api/src/repositories/domain.repository';

/**
 * RISK-04 — alvo pós-G5 (DEV-102/DEV-103), CT35 em
 * `features/Feature 05  Garantir idempotência.md`.
 *
 * Depois de um timeout (a operação já concluiu no backend, mas a
 * resposta não chegou a tempo), repetir com o mesmo `requestId` deveria
 * retornar a transação original, sem novo débito — em vez de `409`.
 * Falha por desenho; não roda na CI pública.
 */

let app: INestApplication;
let db: PrismaService;
let base: string;
let now: Date;

settings.setLogLevel('SILENT');

beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Suíte reservada exige finbank_test.');
  app = await createApiApplication();
  db = app.get(PrismaService);
  vi.spyOn(
    app.get<PersistenceRuntime>(PERSISTENCE_RUNTIME),
    'now',
  ).mockImplementation(() => now);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
});

beforeEach(async () => {
  now = new Date('2026-08-18T15:00:00Z');
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

it('[DEV-102/CT35] retry com o mesmo requestId após timeout retorna a transação original', async () => {
  const requestId = 'REQ-TARGET-04-timeout';
  await spec()
    .post(`${base}/pix/intents`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({
      requestId,
      recipientId: 'REC-1001',
      amountCents: 30000,
      deviceId: 'DEV-1001',
    })
    .expectStatus(201);

  await spec()
    .post(`${base}/simulation/scenarios/timeout-after-commit/apply`)
    .withJson({ requestId, delayMs: 500, times: 1 })
    .expectStatus(201);

  let responded = false;
  const pending = (async () =>
    spec()
      .post(`${base}/pix/intents/${requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({ transactionPassword: '123456' })
      .expectStatus(200))().finally(() => {
    responded = true;
  });

  let committedBeforeResponse = false;
  while (!responded) {
    if (await db.transaction.findFirst({ where: { requestId } })) {
      committedBeforeResponse = true;
      break;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 20));
  }
  expect(committedBeforeResponse).toBe(true);
  const original = await pending;

  // "Tentar novamente" com o mesmo requestId (RP-08/ErroView) — hoje
  // recebe 409 em vez do resultado original.
  const retry = await spec()
    .post(`${base}/pix/intents/${requestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({ transactionPassword: '123456' });

  expect(retry.statusCode).toBe(200);
  expect(retry.body.transactionId).toBe(original.body.transactionId);
  expect(await db.transaction.count({ where: { requestId } })).toBe(1);
});
