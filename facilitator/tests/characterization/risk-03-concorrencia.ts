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
 * RISK-03 / D02 (concorrência) — dev/05-controle-didatico.md.
 *
 * Verificado ao vivo em 3 execuções consecutivas antes de escrever este
 * teste: duas confirmações verdadeiramente simultâneas na mesma
 * `requestId` sempre resultam em uma aprovada (200) e a outra com
 * `500 PROCESSING_ERROR` — nunca as duas aprovadas (o Mongo protege o
 * dado), mas também nunca as duas coordenadas (a perdedora não recebe o
 * mesmo `transactionId` nem um 409 previsível; CT34 em
 * `features/Feature 05  Garantir idempotência.md` é o alvo: ambas
 * deveriam retornar o mesmo `transactionId`).
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

it('duas confirmações simultâneas na mesma requestId não são coordenadas', async () => {
  const requestId = 'REQ-RISK-03-concorrente';
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

  expect([a.statusCode, b.statusCode].sort()).toEqual([200, 500]);

  const winner = a.statusCode === 200 ? a : b;
  const persisted = await db.transaction.findMany({ where: { requestId } });
  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.transactionId).toBe(winner.body.transactionId);
});
