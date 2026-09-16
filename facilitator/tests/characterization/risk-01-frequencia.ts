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
 * RISK-01 / D01 (dev/05-controle-didatico.md).
 *
 * `PixRiskEvaluator.evaluate` chama `history.load(...)`, mas a decisão em
 * si (`evaluateCurrentRisk`) usa só o valor da transação atual — o
 * histórico é lido e descartado. Nove PIX de R$ 4.900 aprovados nos
 * minutos anteriores (cenário `behavior-pattern`, DEV-040) não mudam o
 * resultado do décimo.
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

it('décimo PIX de R$ 4.900 em minutos é aprovado como os outros nove', async () => {
  await spec()
    .post(`${base}/simulation/scenarios/behavior-pattern/apply`)
    .expectStatus(201);

  // Continua o padrão: mais um pagamento de R$ 4.900, 2 minutos depois do
  // último dos nove já aprovados pelo cenário.
  now = new Date(now.getTime() + 2 * 60 * 1000);
  const requestId = 'REQ-RISK-01-decimo';
  await spec()
    .post(`${base}/pix/intents`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({
      requestId,
      recipientId: 'REC-1001',
      amountCents: 490000,
      deviceId: 'DEV-1001',
    })
    .expectStatus(201);

  const response = await spec()
    .post(`${base}/pix/intents/${requestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .withJson({ transactionPassword: '123456' })
    .expectStatus(200);

  expect(response.body).toMatchObject({
    status: 'APPROVED',
    reasonCodes: ['WITHIN_CURRENT_RULES'],
  });
});
