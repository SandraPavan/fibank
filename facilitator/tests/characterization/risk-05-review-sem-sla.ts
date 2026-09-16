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
 * RISK-05 / D04 (dev/05-controle-didatico.md).
 *
 * O cenário `stale-review` (DEV-040) cria uma transação REVIEW com 25h.
 * Não existe métrica de idade, alerta nem escalonamento em nenhuma
 * resposta pública — a transação some na paginação/filtros como
 * qualquer outra REVIEW.
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

it('review com 25h não expõe idade, alerta ou escalonamento', async () => {
  await spec()
    .post(`${base}/simulation/scenarios/stale-review/apply`)
    .expectStatus(201);

  const response = await spec()
    .get(`${base}/transactions/TXN-STALE-REVIEW`)
    .withHeaders('X-Local-Profile-Id', 'PRO-1001')
    .expectStatus(200);

  expect(response.body.status).toBe('REVIEW');
  // Envelope público completo — nenhum campo de idade/alerta/escalonamento.
  expect(Object.keys(response.body).sort()).toEqual([
    'amountCents',
    'createdAt',
    'description',
    'processedAt',
    'reasonCodes',
    'recipientSnapshot',
    'requestId',
    'status',
    'transactionId',
    'type',
  ]);
});
