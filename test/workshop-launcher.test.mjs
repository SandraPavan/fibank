import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(root, 'scripts', 'workshop.mjs');
const composePrefix = `compose -p finbank -f ${path.join(root, 'compose.yaml')}`;
const readyState = JSON.stringify([
  { Service: 'mongo', State: 'running', Health: 'healthy' },
  { Service: 'mongo-init', State: 'exited', ExitCode: 0 },
  { Service: 'api', State: 'running', Health: 'healthy' },
  { Service: 'web', State: 'running', Health: 'healthy' },
]);
const partialState = JSON.stringify([
  { Service: 'mongo', State: 'running', Health: 'unhealthy' },
  { Service: 'mongo-init', State: 'exited', ExitCode: 2 },
  { Service: 'api', State: 'exited', ExitCode: 1 },
  { Service: 'web', State: 'exited', ExitCode: 0 },
]);
const readyJsonLines = [
  { Service: 'mongo', State: 'running', Health: 'healthy' },
  { Service: 'mongo-init', State: 'exited', ExitCode: 0 },
  { Service: 'api', State: 'running', Health: 'healthy' },
  { Service: 'web', State: 'running', Health: 'healthy' },
]
  .map((row) => JSON.stringify(row))
  .join('\\n');

async function fixture(t, scenario = 'ready') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finbank-launcher-'));
  const log = path.join(directory, 'docker.log');
  const docker = path.join(directory, 'docker');
  await writeFile(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$FAKE_SCENARIO:$*" in
  signal:"--version") kill -TERM $$ ;;
  no-docker:"--version") printf '%s\\n' 'Docker ausente' >&2; exit 3 ;;
  no-compose:"compose version") printf '%s\\n' 'Compose ausente' >&2; exit 4 ;;
  no-daemon:"info") printf '%s\\n' 'daemon parado' >&2; exit 5 ;;
  bad-config:"${composePrefix} config --quiet") printf '%s\\n' 'config inválida' >&2; exit 6 ;;
  start-up-fails:"${composePrefix} up --build --wait"|reset-up-fails:"${composePrefix} up --build --wait"|start-up-and-ps-fail:"${composePrefix} up --build --wait"|reset-up-and-ps-fail:"${composePrefix} up --build --wait") printf '%s\\n' 'build falhou' >&2; exit 7 ;;
  stop-down-fails:"${composePrefix} down") printf '%s\\n' 'stop falhou' >&2; exit 8 ;;
  reset-down-fails:"${composePrefix} down --volumes --remove-orphans") printf '%s\\n' 'reset falhou' >&2; exit 10 ;;
  status-ps-fails:"${composePrefix} ps -a --format json"|start-up-and-ps-fail:"${composePrefix} ps -a --format json"|reset-up-and-ps-fail:"${composePrefix} ps -a --format json") printf '%s\\n' 'ps falhou' >&2; exit 9 ;;
  port-ps-fails:"${composePrefix} ps -a --format json web") printf '%s\\n' 'ps da web falhou' >&2; exit 11 ;;
esac
case "$*" in
  "--version"|"compose version"|"info"|"${composePrefix} config --quiet"|"${composePrefix} up --build --wait"|"${composePrefix} down"|"${composePrefix} down --volumes --remove-orphans") exit 0 ;;
  "${composePrefix} ps -a --format json web")
    case "$FAKE_SCENARIO" in
      own-port) printf '%s\\n' '[{"Service":"web","State":"running","Health":"healthy","Publishers":[{"URL":"127.0.0.1","PublishedPort":8080}]}]' ;;
      stopped-own-port) printf '%s\\n' '[{"Service":"web","State":"exited","ExitCode":0,"Publishers":[{"URL":"127.0.0.1","PublishedPort":8080}]}]' ;;
      publishers-invalid) printf '%s\\n' '[{"Service":"web","State":"running","Publishers":{"PublishedPort":8080}}]' ;;
      *) printf '%s\\n' '[]' ;;
    esac
    exit 0
    ;;
  "${composePrefix} ps -a --format json")
    case "$FAKE_SCENARIO" in
      absent) printf '%s\\n' '[]' ;;
      partial|start-up-fails|reset-up-fails|post-up-partial) printf '%s\\n' '${partialState}' ;;
      stopped) printf '%s\\n' '[{"Service":"mongo","State":"exited","ExitCode":0},{"Service":"mongo-init","State":"exited","ExitCode":0},{"Service":"api","State":"created"},{"Service":"web","State":"paused"}]' ;;
      json-lines) printf '%b\\n' '${readyJsonLines}' ;;
      duplicate) printf '%s\\n' '[{"Service":"mongo","State":"running","Health":"healthy"},{"Service":"mongo","State":"exited","ExitCode":1}]' ;;
      invalid-fields) printf '%s\\n' '[{"Service":"mongo","State":{},"Health":[]}]' ;;
      starting) printf '%s\\n' '[{"Service":"mongo","State":"running","Health":"starting"}]' ;;
      invalid-exit-code) printf '%s\\n' '[{"Service":"mongo-init","State":"exited","ExitCode":false}]' ;;
      malformed) printf '%s\\n' 'isto não é json e este trecho comprova o diagnóstico sem despejar uma saída arbitrariamente longa 01234567890123456789012345678901234567890123456789012345678901234567890' ;;
      null-json) printf '%s\\n' 'null' ;;
      *) printf '%s\\n' '${readyState}' ;;
    esac
    exit 0
    ;;
esac
printf '%s\\n' "comando inesperado: $*" >&2
exit 97
`,
  );
  await chmod(docker, 0o755);
  t.after(async () => rm(directory, { force: true, recursive: true }));
  return { directory, log, scenario };
}

function run(command, fake, cwd = fake.directory, extraArguments = []) {
  return spawnSync(process.execPath, [launcher, command, ...extraArguments], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fake.directory}${path.delimiter}${process.env.PATH}`,
      FAKE_DOCKER_LOG: fake.log,
      FAKE_SCENARIO: fake.scenario,
    },
  });
}

async function calls(fake) {
  return (await readFile(fake.log, 'utf8')).trim().split('\n');
}

async function withOccupiedPort(action) {
  const server = net.createServer();
  const ownsPort = await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(8080, '127.0.0.1', () => resolve(true));
  });
  try {
    return await action();
  } finally {
    if (ownsPort) await new Promise((resolve) => server.close(resolve));
  }
}

test('start usa raiz absoluta, project explícito e ordem completa', async (t) => {
  const fake = await fixture(t, 'own-port');
  const result = run('start', fake, os.tmpdir());
  assert.equal(result.status, 0, result.stderr);
  const actualCalls = await calls(fake);
  assert.deepEqual(
    actualCalls.filter((call) => !call.endsWith('ps -a --format json web')),
    [
      '--version',
      'compose version',
      'info',
      `${composePrefix} config --quiet`,
      `${composePrefix} up --build --wait`,
      `${composePrefix} ps -a --format json`,
    ],
  );
  assert.match(result.stdout, /mongo-init: concluído \(código 0\)/);
  assert.match(result.stdout, /http:\/\/localhost:8080\/api\/health/);
});

test('status é read-only e usa classificações em português com códigos', async (t) => {
  for (const scenario of ['ready', 'partial', 'stopped', 'absent']) {
    const fake = await fixture(t, scenario);
    const result = run('status', fake);
    assert.equal(result.status, scenario === 'ready' ? 0 : 1, result.stderr);
    assert.doesNotMatch(
      (await calls(fake)).join('\n'),
      /\b(up|down|start|stop|restart|rm)\b/,
    );
    if (scenario === 'partial') {
      assert.match(result.stdout, /mongo: falho/);
      assert.match(result.stdout, /mongo-init: falho \(código 2\)/);
      assert.match(result.stdout, /api: falho \(código 1\)/);
      assert.match(result.stdout, /web: parado \(código 0\)/);
    }
    if (scenario === 'stopped') assert.match(result.stdout, /api: parado/);
    if (scenario === 'absent') assert.match(result.stdout, /web: ausente/);
  }
});

test('stop e reset seguem ordem completa e preservam limites destrutivos', async (t) => {
  const stopped = await fixture(t, 'absent');
  const stopResult = run('stop', stopped);
  assert.equal(stopResult.status, 0);
  assert.match(
    stopResult.stdout,
    /volumes finbank_mongo_data e finbank_mongo_config foram preservados/,
  );
  assert.deepEqual(await calls(stopped), [
    '--version',
    'compose version',
    'info',
    `${composePrefix} config --quiet`,
    `${composePrefix} down`,
  ]);

  const reset = await fixture(t, 'own-port');
  assert.equal(run('reset', reset).status, 0);
  const resetCalls = await calls(reset);
  assert.deepEqual(
    resetCalls.filter((call) => !call.endsWith('ps -a --format json web')),
    [
      '--version',
      'compose version',
      'info',
      `${composePrefix} config --quiet`,
      `${composePrefix} down --volumes --remove-orphans`,
      `${composePrefix} up --build --wait`,
      `${composePrefix} ps -a --format json`,
    ],
  );
  assert.doesNotMatch(
    (await calls(reset)).join('\n'),
    /system prune|volume prune|\*/,
  );
});

test('preflight impede mutações em start, stop e reset', async (t) => {
  for (const command of ['start', 'stop', 'reset']) {
    for (const [scenario, code, diagnostic] of [
      ['no-docker', 3, 'Docker CLI indisponível'],
      ['no-compose', 4, 'Docker Compose indisponível'],
      ['no-daemon', 5, 'daemon Docker indisponível'],
      ['bad-config', 6, 'configuração Compose inválida'],
    ]) {
      const fake = await fixture(t, scenario);
      const result = run(command, fake);
      assert.equal(result.status, code);
      assert.match(result.stderr, new RegExp(diagnostic));
      assert.doesNotMatch((await calls(fake)).join('\n'), / up | down/);
    }
  }
});

test('falhas de mutação e consulta preservam código e diagnóstico acionável', async (t) => {
  const start = await fixture(t, 'start-up-fails');
  const startResult = run('start', start);
  assert.equal(startResult.status, 7);
  assert.match(startResult.stderr, /estado observado após a falha/);
  assert.match(startResult.stdout, /api: falho \(código 1\)/);
  assert.match(startResult.stderr, /workshop:start novamente/);

  const stop = await fixture(t, 'stop-down-fails');
  assert.equal(run('stop', stop).status, 8);

  const resetDown = await fixture(t, 'reset-down-fails');
  const resetDownResult = run('reset', resetDown);
  assert.equal(resetDownResult.status, 10);
  assert.doesNotMatch((await calls(resetDown)).join('\n'), / up /);

  const resetUp = await fixture(t, 'reset-up-fails');
  const resetUpResult = run('reset', resetUp);
  assert.equal(resetUpResult.status, 7);
  assert.match(
    resetUpResult.stderr,
    /volumes finbank_mongo_data e finbank_mongo_config podem já ter sido removidos/,
  );
  assert.match(resetUpResult.stderr, /workshop:reset novamente/);

  const status = await fixture(t, 'status-ps-fails');
  assert.equal(run('status', status).status, 9);

  const partial = await fixture(t, 'post-up-partial');
  const partialResult = run('start', partial);
  assert.equal(partialResult.status, 1);
  assert.match(partialResult.stderr, /não está pronta/);

  for (const [command, scenario] of [
    ['start', 'start-up-and-ps-fail'],
    ['reset', 'reset-up-and-ps-fail'],
  ]) {
    const combined = await fixture(t, scenario);
    const combinedResult = run(command, combined);
    assert.equal(combinedResult.status, 7);
    assert.match(
      combinedResult.stderr,
      /não foi possível consultar os serviços/,
    );
  }
});

test('sondagem real bloqueia start/reset externos, aceita porta própria e não bloqueia stop', async (t) => {
  await withOccupiedPort(async () => {
    for (const command of ['start', 'reset']) {
      const external = await fixture(t);
      const blocked = run(command, external);
      assert.equal(blocked.status, 1);
      assert.match(blocked.stderr, /ocupada por um processo externo/);
      assert.doesNotMatch((await calls(external)).join('\n'), / up | down/);
    }

    for (const command of ['start', 'reset']) {
      const own = await fixture(t, 'own-port');
      assert.equal(run(command, own).status, 0);
      assert.match((await calls(own)).join('\n'), /ps -a --format json web/);
    }

    const stopped = await fixture(t);
    const result = run('stop', stopped);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /stop continuará/);
    assert.match((await calls(stopped)).join('\n'), / down$/m);

    const failedInspection = await fixture(t, 'port-ps-fails');
    const failedInspectionResult = run('stop', failedInspection);
    assert.equal(failedInspectionResult.status, 0);
    assert.match(failedInspectionResult.stderr, /O stop continuará/);
    assert.match((await calls(failedInspection)).join('\n'), / down$/m);
  });
});

test('parsing rejeita JSON malformado/primitivo e trata Publishers inválido ou stack parada', async (t) => {
  for (const scenario of ['malformed', 'null-json']) {
    const fake = await fixture(t, scenario);
    const result = run('status', fake);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /saída de estados inválida:/);
    if (scenario === 'malformed') assert.ok(result.stderr.length < 600);
  }

  await withOccupiedPort(async () => {
    for (const scenario of ['publishers-invalid', 'stopped-own-port']) {
      const fake = await fixture(t, scenario);
      const result = run('start', fake);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /processo externo/);
    }
  });
});

test('parsing aceita JSON por linha e rejeita estados ambíguos ou mal tipados', async (t) => {
  const jsonLines = await fixture(t, 'json-lines');
  const jsonLinesResult = run('status', jsonLines);
  assert.equal(jsonLinesResult.status, 0, jsonLinesResult.stderr);
  assert.match(jsonLinesResult.stdout, /stack FinBank pronta/);

  for (const scenario of ['duplicate', 'invalid-fields']) {
    const fake = await fixture(t, scenario);
    const result = run('status', fake);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /inválid/);
  }

  const invalidExitCode = await fixture(t, 'invalid-exit-code');
  const invalidExitCodeResult = run('status', invalidExitCode);
  assert.equal(invalidExitCodeResult.status, 1);
  assert.doesNotMatch(invalidExitCodeResult.stdout, /concluído/);

  const starting = await fixture(t, 'starting');
  const startingResult = run('status', starting);
  assert.equal(startingResult.status, 1);
  assert.match(startingResult.stdout, /mongo: iniciando/);
});

test('rejeita argumentos extras antes do preflight e diagnostica término por sinal', async (t) => {
  const extra = await fixture(t);
  const result = run('reset', extra, extra.directory, ['--force']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sem argumentos extras/);
  await assert.rejects(readFile(extra.log, 'utf8'), { code: 'ENOENT' });

  const signal = await fixture(t, 'signal');
  const signalResult = run('status', signal);
  assert.equal(signalResult.status, 1);
  assert.match(signalResult.stderr, /sinal SIGTERM/);
});
