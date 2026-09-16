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
 * RISK-02 / D02 (dev/05-controle-didatico.md, dev/06-estrategia-de-testes.md).
 *
 * Confirmar duas vezes o **mesmo** `requestId` já é bloqueado hoje (409
 * `PIX_INTENT_NOT_CONFIRMABLE` — verificado ao vivo antes de escrever este
 * teste). A duplicação real é a que dev/09-backlog.md (DEV-032) já
 * registra como preservada: o cliente, achando que a primeira tentativa
 * falhou, recria a solicitação com um `requestId` novo para o mesmo
 * pagamento — não existe índice único nem verificação de "já processei
 * isso" fora do escopo de uma única `requestId`.
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

function pay(requestId: string) {
  return async () => {
    await spec()
      .post(`${base}/pix/intents`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({
        requestId,
        recipientId: 'REC-1001',
        amountCents: 50000,
        deviceId: 'DEV-1001',
        description: 'Aluguel',
      })
      .expectStatus(201);
    return spec()
      .post(`${base}/pix/intents/${requestId}/confirm`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .withJson({ transactionPassword: '123456' })
      .expectStatus(200);
  };
}

it('retry com requestId novo para o mesmo pagamento cria uma segunda transação e um segundo débito', async () => {
  const before = (
    await spec()
      .get(`${base}/accounts/me`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .expectStatus(200)
  ).body.balanceCents as number;

  const first = await pay('REQ-RISK-02-A')();
  // "Retry": o cliente, sem saber que a primeira concluiu, tenta de novo
  // com um requestId novo — mesmo destinatário, valor e descrição.
  const second = await pay('REQ-RISK-02-B')();

  expect(first.body.transactionId).not.toBe(second.body.transactionId);
  expect(
    await db.transaction.count({
      where: { requestId: { in: ['REQ-RISK-02-A', 'REQ-RISK-02-B'] } },
    }),
  ).toBe(2);

  const after = (
    await spec()
      .get(`${base}/accounts/me`)
      .withHeaders('X-Local-Profile-Id', 'PRO-1001')
      .expectStatus(200)
  ).body.balanceCents as number;
  expect(before - after).toBe(2 * 50000);
});
