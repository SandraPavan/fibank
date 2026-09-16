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
 * RISK-05 — alvo pós-G5 (DEV-103, "métrica de idade, alerta e fluxo
 * operacional" — dev/05-controle-didatico.md).
 *
 * DEV-103 ainda não define o contrato exato de alerta/SLA (nenhum CT das
 * Features cobre isso especificamente); `alertSla` abaixo é um
 * placeholder ilustrativo do formato esperado, não um contrato já
 * acordado — ajustar quando DEV-103 especificar o campo real. Falha por
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

it('[DEV-103] review com 25h expõe um sinal operacional de SLA estourado', async () => {
  await spec()
    .post(`${base}/simulation/scenarios/stale-review/apply`)
    .expectStatus(201);

  const response = await spec()
    .get(`${base}/transactions/TXN-STALE-REVIEW`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .expectStatus(200);

  expect(response.body).toHaveProperty('alertSla', true);
});
