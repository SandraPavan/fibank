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
 * RISK-06 — alvo pós-G5 (DEV-101), CT29 em
 * `features/Feature 04  Avaliar comportamento recente.md`.
 *
 * CT29 pede que o dispositivo novo "seja considerado como sinal de
 * risco" — sem obrigar `REVIEW` (RF-03/CT23 avisam para não assumir
 * isso). O mínimo verificável é que o resultado passe a diferir do caso
 * com dispositivo conhecido; hoje são idênticos (suíte de
 * characterization). Falha por desenho; não roda na CI pública.
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

it('[DEV-101/CT29] dispositivo novo é considerado como sinal na avaliação de risco', async () => {
  const known = await pay('REQ-TARGET-06-known', 'DEV-1001')();
  const unknown = await pay('REQ-TARGET-06-new', 'DEV-NEW-01')();

  expect(unknown.body.reasonCodes).not.toEqual(known.body.reasonCodes);
});
