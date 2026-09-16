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
 * RISK-06 / D05 (dev/05-controle-didatico.md; CT23 em
 * `features/Feature 03  Avaliar risco da transação atual.md`).
 *
 * `PixRiskInput` nem recebe `deviceId` — a avaliação de risco não tem
 * como diferenciar um dispositivo conhecido de um novo. CT23 já avisa
 * para não assumir que isso vira `REVIEW`; a característica real é a
 * ausência total do sinal: duas transações idênticas (mesmo valor,
 * destinatário e senha), diferindo só no `deviceId`, produzem exatamente
 * o mesmo `riskScore`/`reasonCodes`.
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

function pay(requestId: string, deviceId: string) {
  return async () => {
    await spec()
      .post(`${base}/pix/intents`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({
        requestId,
        recipientId: 'REC-1001',
        amountCents: 45000,
        deviceId,
      })
      .expectStatus(201);
    return spec()
      .post(`${base}/pix/intents/${requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({ transactionPassword: '123456' })
      .expectStatus(200);
  };
}

it('dispositivo novo produz risco idêntico ao de um dispositivo conhecido', async () => {
  // DEV-1001 está em `knownDeviceIds` do perfil base; DEV-NEW-01 não.
  const known = await pay('REQ-RISK-06-known', 'DEV-1001')();
  const unknown = await pay('REQ-RISK-06-new', 'DEV-NEW-01')();

  expect(unknown.body.status).toBe(known.body.status);
  expect(unknown.body.reasonCodes).toEqual(known.body.reasonCodes);

  const knownTx = await db.transaction.findFirst({
    where: { requestId: 'REQ-RISK-06-known' },
  });
  const newTx = await db.transaction.findFirst({
    where: { requestId: 'REQ-RISK-06-new' },
  });
  expect(newTx?.riskScore).toBe(knownTx?.riskScore);
});
