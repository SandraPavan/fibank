import 'reflect-metadata';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { spec, settings } from 'pactum';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { ProfileResponse } from '@finbank/contracts';
import { createApiApplication } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';
import { reset } from '../src/database/seed';
import { transactions } from '../src/database/fixtures';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../src/repositories/domain.repository';
import { DEFAULT_WORKSPACE_ID } from '../src/workspace/workspace-context';

// Mesmo default de `facilitator.guard.ts` quando `FACILITATOR_ACCESS_CODE` não é
// definido — evita mutar `process.env` num arquivo que roda em série com
// os demais (`fileParallelism: false`).
const FACILITATOR_ACCESS_CODE = 'local-facilitator-code';

let db: PrismaService;
let repo: DomainRepository;
let app: INestApplication;
let base: string;
// DEV-103 (porção facilitador): fixa o relógio para que `reviewSlaBreached`
// das métricas seja determinístico.
const now = new Date('2026-08-18T15:00:00Z');
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
  await reset(db, {
    WORKSHOP_MODE: 'true',
    DATABASE_URL: process.env.DATABASE_URL,
  });
  // Este arquivo é o único que cria workspaces extras; limpa qualquer
  // resíduo de uma execução anterior para ficar repetível sem depender de
  // um volume novo do Mongo a cada corrida.
  const stale = { workspaceId: { not: DEFAULT_WORKSPACE_ID } };
  await db.transaction.deleteMany({ where: stale });
  await db.pixIntent.deleteMany({ where: stale });
  await db.account.deleteMany({ where: stale });
  await db.localProfile.deleteMany({ where: stale });
  await db.recipient.deleteMany({ where: stale });
  await db.workspace.deleteMany();
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

function facilitator() {
  return spec().withHeaders('X-Facilitator-Secret', FACILITATOR_ACCESS_CODE);
}

/** `Set-Cookie: finbank_workspace=<token>; Path=/; HttpOnly; SameSite=Lax` → só o par a reenviar. */
function cookiePair(setCookie: unknown): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof raw !== 'string') throw new Error('Set-Cookie ausente.');
  return raw.split(';')[0]!;
}

async function createGroup(groupSlug: string) {
  const response = await facilitator()
    .post(`${base}/facilitator/workspaces`)
    .withJson({ groupSlug })
    .expectStatus(201);
  const { code } = response.body as { code: string };
  const join = await spec()
    .post(`${base}/sessions/join`)
    .withJson({ groupSlug, code })
    .expectStatus(201);
  expect(join.body).toEqual({ groupSlug });
  return cookiePair(join.headers['set-cookie']);
}

it('isola contas, perfis e reset entre dois grupos do facilitador', async () => {
  const cookieA = await createGroup('grupo-isolamento-a');
  const cookieB = await createGroup('grupo-isolamento-b');

  // Toda sessão nova parte da mesma baseline fictícia (fixture replicada por
  // workspace) — os três "mundos" começam idênticos.
  for (const cookie of [cookieA, cookieB, undefined]) {
    const request = spec().get(`${base}/accounts/me`);
    if (cookie) request.withHeaders('Cookie', cookie);
    const response = await request.expectStatus(200);
    expect(response.body).toMatchObject({
      accountId: 'ACC-1001',
      balanceCents: 14525000,
    });
  }

  // Cadastro feito na sessão do grupo A não aparece nem no grupo B nem no
  // workspace padrão (sem cookie).
  const created = (
    await spec()
      .post(`${base}/profiles`)
      .withHeaders('Cookie', cookieA)
      .withJson({
        displayName: 'Pessoa do Grupo A',
        transactionPassword: '012345',
      })
      .expectStatus(201)
  ).body as ProfileResponse;
  const profilesA = (
    await spec()
      .get(`${base}/profiles`)
      .withHeaders('Cookie', cookieA)
      .expectStatus(200)
  ).body as ProfileResponse[];
  expect(profilesA.map((p) => p.profileId)).toContain(created.profileId);
  for (const cookie of [cookieB, undefined]) {
    const request = spec().get(`${base}/profiles`);
    if (cookie) request.withHeaders('Cookie', cookie);
    const profiles = (await request.expectStatus(200))
      .body as ProfileResponse[];
    expect(profiles.map((p) => p.profileId)).not.toContain(created.profileId);
  }
  // Consultar a conta do grupo A pelo `profileId` sem estar na sessão A não
  // enxerga nada — nem sequer um 404 que confirme a existência do perfil.
  await spec()
    .get(`${base}/accounts/me`)
    .withHeaders('Cookie', cookieB)
    .withHeaders('X-Local-Profile-Id', created.profileId)
    .expectStatus(404);

  // Mutação direta (equivalente a um débito real) só afeta o workspace do A.
  const workspaces = await db.workspace.findMany({
    where: { groupSlug: { in: ['grupo-isolamento-a', 'grupo-isolamento-b'] } },
  });
  const workspaceA = workspaces.find(
    (workspace) => workspace.groupSlug === 'grupo-isolamento-a',
  )!;
  const workspaceB = workspaces.find(
    (workspace) => workspace.groupSlug === 'grupo-isolamento-b',
  )!;
  const baseline = (await repo.account('PRO-1001', workspaceA.workspaceId))!;
  await repo.saveAccount(
    { ...baseline, balanceCents: 1 },
    workspaceA.workspaceId,
  );
  await spec()
    .get(`${base}/accounts/me`)
    .withHeaders('Cookie', cookieA)
    .expectStatus(200)
    .expectJsonLike({ balanceCents: 1 });
  await spec()
    .get(`${base}/accounts/me`)
    .withHeaders('Cookie', cookieB)
    .expectStatus(200)
    .expectJsonLike({ balanceCents: 14525000 });

  // Reset explícito de um único grupo restaura só aquele workspace.
  await facilitator()
    .post(`${base}/facilitator/workspaces/grupo-isolamento-a/reset`)
    .expectStatus(200);
  await spec()
    .get(`${base}/accounts/me`)
    .withHeaders('Cookie', cookieA)
    .expectStatus(200)
    .expectJsonLike({ balanceCents: 14525000 });
  const profilesAfterReset = (
    await spec()
      .get(`${base}/profiles`)
      .withHeaders('Cookie', cookieA)
      .expectStatus(200)
  ).body as ProfileResponse[];
  expect(profilesAfterReset.map((p) => p.profileId)).not.toContain(
    created.profileId,
  );

  // `workspaceId` enviado no corpo nunca é aceito como campo do domínio —
  // o cadastro só aceita exatamente displayName + transactionPassword.
  await spec()
    .post(`${base}/profiles`)
    .withHeaders('Cookie', cookieA)
    .withJson({
      displayName: 'Tentativa',
      transactionPassword: '012345',
      workspaceId: workspaceB.workspaceId,
    })
    .expectStatus(400);
});

it('join exige grupo e código válidos; facilitador exige o segredo', async () => {
  await facilitator()
    .post(`${base}/facilitator/workspaces`)
    .withJson({ groupSlug: 'grupo-auth' })
    .expectStatus(201);
  await spec()
    .post(`${base}/sessions/join`)
    .withJson({ groupSlug: 'grupo-auth', code: 'CODIGOERRADO' })
    .expectStatus(404);
  await spec()
    .post(`${base}/sessions/join`)
    .withJson({ groupSlug: 'grupo-inexistente', code: 'ABC123' })
    .expectStatus(404);
  await spec()
    .post(`${base}/facilitator/workspaces`)
    .withJson({ groupSlug: 'grupo-auth' })
    .expectStatus(401);
  await facilitator()
    .post(`${base}/facilitator/workspaces`)
    .withJson({ groupSlug: 'grupo-auth' })
    .expectStatus(409);
});

it('DEV-103: métricas do facilitador contam por status e por workspace, sem vazar entre grupos', async () => {
  await createGroup('grupo-metricas-a');
  await createGroup('grupo-metricas-b');
  const workspaceA = await db.workspace.findFirstOrThrow({
    where: { groupSlug: 'grupo-metricas-a' },
  });

  // Toda criação de grupo já semeia a mesma fixture base (`initialize`);
  // substitui por um conjunto controlado para números exatos e previsíveis.
  await db.transaction.deleteMany({
    where: { workspaceId: workspaceA.workspaceId },
  });
  await db.transaction.createMany({
    data: [
      {
        ...transactions[0]!,
        workspaceId: workspaceA.workspaceId,
        transactionId: 'TXN-metrics-approved',
        requestId: 'REQ-metrics-approved',
        status: 'APPROVED',
      },
      {
        ...transactions[0]!,
        workspaceId: workspaceA.workspaceId,
        transactionId: 'TXN-metrics-review-fresh',
        requestId: 'REQ-metrics-review-fresh',
        status: 'REVIEW',
        createdAt: new Date(now.getTime() - 60 * 1000),
      },
      {
        ...transactions[0]!,
        workspaceId: workspaceA.workspaceId,
        transactionId: 'TXN-metrics-review-stale',
        requestId: 'REQ-metrics-review-stale',
        status: 'REVIEW',
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      },
      {
        ...transactions[0]!,
        workspaceId: workspaceA.workspaceId,
        transactionId: 'TXN-metrics-rejected',
        requestId: 'REQ-metrics-rejected',
        status: 'REJECTED',
      },
    ],
  });

  const metricsA = await facilitator()
    .get(`${base}/facilitator/workspaces/grupo-metricas-a/metrics`)
    .expectStatus(200);
  expect(metricsA.body).toEqual({
    groupSlug: 'grupo-metricas-a',
    approved: 1,
    review: 2,
    reviewSlaBreached: 1,
    rejected: 1,
    failed: 0,
  });

  // grupo-metricas-b nunca teve `Transaction` tocada aqui — só a fixture
  // base semeada por `initialize` (3 aprovadas, 1 review com 22h, 1 falha).
  // Nada do grupo A aparece aqui.
  const metricsB = await facilitator()
    .get(`${base}/facilitator/workspaces/grupo-metricas-b/metrics`)
    .expectStatus(200);
  expect(metricsB.body).toEqual({
    groupSlug: 'grupo-metricas-b',
    approved: 3,
    review: 1,
    reviewSlaBreached: 0,
    rejected: 0,
    failed: 1,
  });

  await facilitator()
    .get(`${base}/facilitator/workspaces/grupo-inexistente/metrics`)
    .expectStatus(404);
});
