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
 * RISK-04 / D02+D03 (dev/05-controle-didatico.md).
 *
 * Combina o mecanismo de `timeout-after-commit` (já provado em
 * `apps/api/test/simulation.integration.ts` — o commit acontece antes da
 * resposta atrasada) com o mesmo padrão de retry do RISK-02: o cliente
 * "desiste" da chamada original e tenta de novo com um `requestId` novo,
 * sem saber que a primeira já tinha sido processada no backend.
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

it('timeout depois do commit seguido de retry com requestId novo gera dois débitos', async () => {
  const originalRequestId = 'REQ-RISK-04-original';
  await spec()
    .post(`${base}/pix/intents`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({
      requestId: originalRequestId,
      recipientId: 'REC-1001',
      amountCents: 30000,
      deviceId: 'DEV-1001',
    })
    .expectStatus(201);

  await spec()
    .post(`${base}/simulation/scenarios/timeout-after-commit/apply`)
    .withJson({ requestId: originalRequestId, delayMs: 500, times: 1 })
    .expectStatus(201);

  let responded = false;
  const pending = (async () =>
    spec()
      .post(`${base}/pix/intents/${originalRequestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({ transactionPassword: '123456' })
      .expectStatus(200))().finally(() => {
    responded = true;
  });

  // Espera o commit real acontecer no banco antes da resposta atrasada
  // chegar — mesmo polling de `simulation.integration.ts`, em vez de um
  // `sleep` fixo.
  let committedBeforeResponse = false;
  while (!responded) {
    if (
      await db.transaction.findFirst({
        where: { requestId: originalRequestId },
      })
    ) {
      committedBeforeResponse = true;
      break;
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 20));
  }
  expect(committedBeforeResponse).toBe(true);

  // O cliente, sem ter recebido a resposta a tempo, "tenta novamente" —
  // mas gera um requestId novo (ErroView/T05 só reaproveita o mesmo
  // requestId quando o usuário clica "Tentar novamente" sem sair do app;
  // reabrir o fluxo do zero em T01, como um cliente frustrado faria,
  // gera um requestId novo via `crypto.randomUUID()`).
  const retryRequestId = 'REQ-RISK-04-retry';
  await spec()
    .post(`${base}/pix/intents`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({
      requestId: retryRequestId,
      recipientId: 'REC-1001',
      amountCents: 30000,
      deviceId: 'DEV-1001',
    })
    .expectStatus(201);
  const retryResponse = await spec()
    .post(`${base}/pix/intents/${retryRequestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({ transactionPassword: '123456' })
    .expectStatus(200);
  expect(retryResponse.body.status).toBe('APPROVED');

  await pending;

  const persisted = await db.transaction.findMany({
    where: { requestId: { in: [originalRequestId, retryRequestId] } },
  });
  expect(persisted).toHaveLength(2);
  expect(persisted.every((tx) => tx.status === 'APPROVED')).toBe(true);
});
