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
 * RISK-03 — alvo pós-G5 (DEV-100), CT34 em
 * `features/Feature 05  Garantir idempotência.md`.
 *
 * Duas confirmações simultâneas na mesma `requestId` deveriam retornar o
 * mesmo `transactionId`, com uma única transação/débito. Hoje uma delas
 * recebe `500 PROCESSING_ERROR` em vez de ser coordenada. Falha por
 * desenho; não roda na CI pública.
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

it('[DEV-100/CT34] duas confirmações simultâneas retornam o mesmo transactionId', async () => {
  const requestId = 'REQ-TARGET-03-concorrente';
  await spec()
    .post(`${base}/pix/intents`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({
      requestId,
      recipientId: 'REC-1001',
      amountCents: 50000,
      deviceId: 'DEV-1001',
    })
    .expectStatus(201);

  const confirmOnce = () =>
    spec()
      .post(`${base}/pix/intents/${requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({ transactionPassword: '123456' });

  const [a, b] = await Promise.all([confirmOnce(), confirmOnce()]);

  expect(a.statusCode).toBe(200);
  expect(b.statusCode).toBe(200);
  expect(a.body.transactionId).toBe(b.body.transactionId);
  expect(await db.transaction.count({ where: { requestId } })).toBe(1);
});
