import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { reset } from '../src/database/seed';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../src/repositories/domain.repository';
let app: INestApplication;
let db: PrismaService;
let repo: DomainRepository;
let intentsBase: string;
let requestsBase: string;
let now: Date;
let profileId: string;
const input = {
  requestId: 'REQ-status',
  recipientId: 'REC-1001',
  amountCents: 100,
  deviceId: 'DEV-status',
  description: 'Pagamento fictício',
};
const password = { transactionPassword: '123456' };
settings.setLogLevel('SILENT');
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Integração exige finbank_test.');
  app = await createApiApplication();
  db = app.get(PrismaService);
  repo = app.get(DomainRepository);
  vi.spyOn(
    app.get<PersistenceRuntime>(PERSISTENCE_RUNTIME),
    'now',
  ).mockImplementation(() => now);
  await app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
  intentsBase = `${origin}/pix/intents`;
  requestsBase = `${origin}/pix/requests`;
});
beforeEach(async () => {
  now = new Date('2026-08-18T15:00:00Z');
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  const registered = await repo.register('Pessoa Status', '123456');
  profileId = registered.profile.profileId;
  await repo.saveAccount({
    ...registered.account,
    knownDeviceIds: [input.deviceId],
  });
  await spec()
    .post(intentsBase)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson(input)
    .expectStatus(201);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
function status(requestId = input.requestId, profile = profileId) {
  return spec()
    .get(`${requestsBase}/${requestId}`)
    .withHeaders('X-Local-Profile-Id', profile);
}
function problem(
  response: {
    statusCode: number;
    headers: Record<string, unknown>;
    body: unknown;
  },
  code: string,
) {
  expect(response.headers['content-type']).toContain(
    'application/problem+json',
  );
  const body =
    typeof response.body === 'string'
      ? JSON.parse(response.body)
      : response.body;
  expect(body).toMatchObject({ code });
  expect(JSON.stringify(body)).not.toMatch(
    /123456|scrypt|riskScore|transactionPasswordHash/,
  );
}
it('devolve PENDING quando a intenção existe e nenhuma transação foi criada', async () => {
  const response = await status().expectStatus(200);
  expect(response.body).toEqual({
    requestId: input.requestId,
    status: 'PENDING',
    transactionId: null,
    reasonCodes: [],
    processedAt: null,
  });
});
it('devolve o resultado persistido depois de confirmado (DEV-100/DEV-102)', async () => {
  const confirmation = await spec()
    .post(`${intentsBase}/${input.requestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson(password)
    .expectStatus(200);
  const response = await status().expectStatus(200);
  expect(response.body).toEqual({
    requestId: input.requestId,
    status: 'APPROVED',
    transactionId: confirmation.body.transactionId,
    reasonCodes: confirmation.body.reasonCodes,
    processedAt: confirmation.body.processedAt,
  });
});
it('nunca escreve nem reprocessa: consultar repetidamente não muda o saldo', async () => {
  await spec()
    .post(`${intentsBase}/${input.requestId}/confirm`)
    .withHeaders('X-Local-Profile-Id', profileId)
    .withJson(password)
    .expectStatus(200);
  const before = await repo.account(profileId);
  await status().expectStatus(200);
  await status().expectStatus(200);
  expect(await repo.account(profileId)).toEqual(before);
});
it('404 para requestId desconhecido e para perfil inválido/inexistente', async () => {
  problem(await status('REQ-missing').expectStatus(404), 'PIX_REQUEST_NOT_FOUND');
  problem(await status(input.requestId, 'bad').expectStatus(400), 'INVALID_LOCAL_PROFILE');
  problem(
    await status(input.requestId, 'PRO-missing').expectStatus(404),
    'LOCAL_PROFILE_NOT_FOUND',
  );
});
it('não vaza o requestId de outra conta', async () => {
  const other = await repo.register('Outra Pessoa Status', '654321');
  problem(
    await status(input.requestId, other.profile.profileId).expectStatus(404),
    'PIX_REQUEST_NOT_FOUND',
  );
});
