import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import { request } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { reset } from '../src/database/seed';
import { DomainRepository } from '../src/repositories/domain.repository';
import type { ProfileResponse } from '@finbank/contracts';
let db: PrismaService;
let app: INestApplication;
let base: string;
settings.setLogLevel('SILENT');
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/finbank_test')
    throw new Error('Integração exige finbank_test.');
  app = await createApiApplication();
  db = app.get(PrismaService);
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
});
afterAll(async () => {
  await app?.close();
});
function problem(
  response: {
    statusCode: number;
    headers: Record<string, unknown>;
    body: unknown;
  },
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain(
    'application/problem+json',
  );
  const body = (
    typeof response.body === 'string'
      ? JSON.parse(response.body)
      : response.body
  ) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual([
    'code',
    'detail',
    'requestId',
    'status',
    'title',
    'traceId',
    'type',
  ]);
  expect(body.code).toBe(code);
  expect(body.status).toBe(status);
  expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(body.traceId).toMatch(/^[a-f0-9-]{36}$/);
}
it('cadastro atômico, projeções e alternância de contas pela API', async () => {
  const create = async () =>
    (
      await spec()
        .post(`${base}/profiles`)
        .withJson({
          displayName: '  Pessoa Exemplo  ',
          transactionPassword: '012345',
        })
        .expectStatus(201)
    ).body as ProfileResponse;
  const first = await create();
  const second = await create();
  expect(Object.keys(first).sort()).toEqual([
    'accountId',
    'displayName',
    'profileId',
  ]);
  expect(first.displayName).toBe('Pessoa Exemplo');
  expect(first.profileId).not.toBe(second.profileId);
  expect(first.accountId).not.toBe(second.accountId);
  const list = (await spec().get(`${base}/profiles`).expectStatus(200))
    .body as ProfileResponse[];
  expect(list.map((p) => p.profileId)).toEqual(
    list.map((p) => p.profileId).sort(),
  );
  expect(list).toEqual(
    [
      {
        profileId: 'PRO-1001',
        displayName: 'Alex Exemplo',
        accountId: 'ACC-1001',
      },
      first,
      second,
    ].sort((a, b) =>
      a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0,
    ),
  );
  for (const profile of list)
    expect(Object.keys(profile).sort()).toEqual([
      'accountId',
      'displayName',
      'profileId',
    ]);
  const repository = app.get(DomainRepository);
  const initial = (await repository.account(first.profileId))!;
  await repository.saveAccount({ ...initial, balanceCents: 42 });
  for (const profile of [first, second, first]) {
    const response = await spec()
      .get(`${base}/accounts/me`)
      .withHeaders('X-Local-Profile-Id', profile.profileId)
      .expectStatus(200);
    expect(response.body).toEqual({
      accountId: profile.accountId,
      profileId: profile.profileId,
      ownerName: 'Pessoa Exemplo',
      documentMasked: '***.***.***-**',
      balanceCents: profile === first ? 42 : 14525000,
      dailyLimitCents: 10000000,
    });
    expect(await repository.transactions(profile.accountId)).toEqual([]);
  }
  await spec().get(`${base}/accounts/me`).expectStatus(200).expectJsonLike({
    accountId: 'ACC-1001',
    profileId: 'PRO-1001',
    balanceCents: 14525000,
  });
});
it('rejeita corpos inválidos sem escrita', async () => {
  const count = await db.localProfile.count();
  const accountCount = await db.account.count();
  for (const body of [
    {},
    [],
    { displayName: '', transactionPassword: '123456' },
    { displayName: 'x'.repeat(81), transactionPassword: '123456' },
    { displayName: 'Exemplo', transactionPassword: 123456 },
    { displayName: 'Exemplo', transactionPassword: '12345' },
    { displayName: 'Exemplo', transactionPassword: '123456', extra: true },
  ]) {
    problem(
      await spec().post(`${base}/profiles`).withJson(body),
      400,
      'INVALID_PROFILE_INPUT',
    );
  }
  problem(
    await spec()
      .post(`${base}/profiles`)
      .withHeaders('Content-Type', 'application/json')
      .withBody('{'),
    400,
    'INVALID_PROFILE_INPUT',
  );
  expect(await db.localProfile.count()).toBe(count);
  expect(await db.account.count()).toBe(accountCount);
});
it('valida contexto inclusive header repetido real', async () => {
  for (const header of ['', 'invalid', 'PRO-1, PRO-2'])
    problem(
      await spec()
        .get(`${base}/accounts/me`)
        .withHeaders('X-Local-Profile-Id', header),
      400,
      'INVALID_LOCAL_PROFILE',
    );
  problem(
    await spec()
      .get(`${base}/accounts/me`)
      .withHeaders('X-Local-Profile-Id', 'PRO-missing'),
    404,
    'LOCAL_PROFILE_NOT_FOUND',
  );
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      `${base}/accounts/me`,
      {
        headers: [
          'X-Local-Profile-Id',
          'PRO-1001',
          'X-Local-Profile-Id',
          'PRO-1001',
        ],
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
  expect(status).toBe(400);
});
it('resolve emails fictícios, mascara dados e ordena frequentes', async () => {
  const found = await spec()
    .get(`${base}/recipients/resolve`)
    .withQueryParams('key', 'marina@example.test')
    .expectStatus(200);
  expect(Object.keys(found.body).sort()).toEqual([
    'documentMasked',
    'institution',
    'name',
    'pixKeyMasked',
    'recipientId',
  ]);
  expect(JSON.stringify(found.body)).not.toContain('marina@example.test');
  for (const suffix of ['', '?key=', '?key=bad', '?key=a&key=b', '?key[x]=a'])
    problem(
      await spec().get(`${base}/recipients/resolve${suffix}`),
      400,
      'INVALID_PIX_KEY',
    );
  problem(
    await spec().get(`${base}/recipients/resolve?key=missing@example.test`),
    404,
    'RECIPIENT_NOT_FOUND',
  );
  const first = (
    await spec().get(`${base}/recipients/frequent`).expectStatus(200)
  ).body;
  expect(
    first.map((recipient: { recipientId: string }) => recipient.recipientId),
  ).toEqual(['REC-1001', 'REC-1002']);
  for (const recipient of first)
    expect(Object.keys(recipient).sort()).toEqual([
      'documentMasked',
      'institution',
      'name',
      'pixKeyMasked',
      'recipientId',
    ]);
  expect(first).toEqual(
    (await spec().get(`${base}/recipients/frequent`).expectStatus(200)).body,
  );
});
it('falhas de repository recebem mensagens estáticas sem segredo', async () => {
  const repository = app.get(DomainRepository);
  for (const [method, path] of [
    ['profiles', 'profiles'],
    ['account', 'accounts/me'],
    ['recipients', 'recipients/frequent'],
    ['recipientByHash', 'recipients/resolve?key=marina@example.test'],
  ] as const) {
    const spy = vi
      .spyOn(repository, method)
      .mockRejectedValue(new Error('SECRET_DATABASE_ERROR'));
    try {
      const response = await spec().get(`${base}/${path}`);
      problem(response, 500, 'PROCESSING_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('SECRET');
    } finally {
      spy.mockRestore();
    }
  }
});

it('falha de cadastro não expõe senha nem detalhes internos', async () => {
  const spy = vi
    .spyOn(app.get(DomainRepository), 'register')
    .mockRejectedValue(new Error('012345 INTERNAL'));
  try {
    const response = await spec()
      .post(`${base}/profiles`)
      .withJson({ displayName: 'Exemplo', transactionPassword: '012345' });
    problem(response, 500, 'PROCESSING_ERROR');
    expect(JSON.stringify(response.body)).not.toMatch(/012345|INTERNAL/);
  } finally {
    spy.mockRestore();
  }
});

it('preserva erros de parser sem escrita nem exposição do corpo', async () => {
  const profiles = await db.localProfile.count();
  const accounts = await db.account.count();
  const oversized = await spec()
    .post(`${base}/profiles`)
    .withJson({
      displayName: 'x'.repeat(101 * 1024),
      transactionPassword: '012345',
    });
  problem(oversized, 413, 'PAYLOAD_TOO_LARGE');
  const charset = await spec()
    .post(`${base}/profiles`)
    .withHeaders('Content-Type', 'application/json; charset=iso-8859-1')
    .withBody('{"displayName":"Exemplo","transactionPassword":"012345"}');
  problem(charset, 415, 'UNSUPPORTED_MEDIA_TYPE');
  for (const response of [oversized, charset])
    expect(JSON.stringify(response.body)).not.toMatch(/012345|iso-8859-1|xxxx/);
  expect(await db.localProfile.count()).toBe(profiles);
  expect(await db.account.count()).toBe(accounts);
});
