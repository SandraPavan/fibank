#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const composeFile = path.join(projectRoot, 'compose.yaml');
const project = 'finbank';
const [command, ...extraArguments] = process.argv.slice(2);
const composePrefix = ['compose', '-p', project, '-f', composeFile];
const services = ['mongo', 'mongo-init', 'api', 'web'];

function fail(message, code = 1) {
  console.error(`falha: ${message}`);
  process.exit(code || 1);
}

function executeDocker(args, { capture = false } = {}) {
  return spawnSync('docker', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function failFromResult(result, label) {
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.signal)
    fail(`${label}: processo encerrado pelo sinal ${result.signal}.`);
  if (result.stderr) process.stderr.write(result.stderr);
  fail(`${label} (código ${result.status ?? 1}).`, result.status ?? 1);
}

function runDocker(args, label, options) {
  const result = executeDocker(args, options);
  if (result.error || result.signal || result.status !== 0)
    failFromResult(result, label);
  return result.stdout ?? '';
}

function executeCompose(args, options) {
  return executeDocker([...composePrefix, ...args], options);
}

function compose(args, label, options) {
  return runDocker([...composePrefix, ...args], label, options);
}

function preflight() {
  runDocker(['--version'], 'Docker CLI indisponível', { capture: true });
  runDocker(['compose', 'version'], 'Docker Compose indisponível', {
    capture: true,
  });
  runDocker(['info'], 'daemon Docker indisponível', { capture: true });
  compose(['config', '--quiet'], 'configuração Compose inválida', {
    capture: true,
  });
}

function invalidOutput(raw) {
  const excerpt = raw.replace(/\s+/g, ' ').trim().slice(0, 160) || '<vazio>';
  throw new Error(`saída de estados inválida: ${excerpt}`);
}

function validateRows(value, raw) {
  const rows = Array.isArray(value) ? value : [value];
  if (
    rows.some(
      (row) => row === null || typeof row !== 'object' || Array.isArray(row),
    )
  ) {
    invalidOutput(raw);
  }
  return rows;
}

function parseComposeJson(raw) {
  const text = raw.trim();
  if (!text) return [];
  try {
    return validateRows(JSON.parse(text), raw);
  } catch (error) {
    if (error.message.startsWith('saída de estados inválida:')) throw error;
  }
  try {
    return validateRows(
      text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
      raw,
    );
  } catch (error) {
    if (error.message.startsWith('saída de estados inválida:')) throw error;
    invalidOutput(raw);
  }
}

function statesFromOutput(raw) {
  const rows = parseComposeJson(raw);
  if (
    rows.some((row) => typeof row.Service !== 'string' || !row.Service) ||
    new Set(rows.map((row) => row.Service)).size !== rows.length
  )
    invalidOutput(raw);
  return new Map(rows.map((row) => [row.Service, row]));
}

function readStates() {
  return statesFromOutput(
    compose(
      ['ps', '-a', '--format', 'json'],
      'não foi possível consultar a stack',
      {
        capture: true,
      },
    ),
  );
}

function exitCode(row) {
  if (
    row.ExitCode === null ||
    row.ExitCode === undefined ||
    row.ExitCode === ''
  )
    return undefined;
  if (
    typeof row.ExitCode !== 'number' &&
    (typeof row.ExitCode !== 'string' || !/^\d+$/.test(row.ExitCode))
  )
    return undefined;
  const value = Number(row.ExitCode);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function exitCodeSuffix(row) {
  const value = exitCode(row);
  return Number.isInteger(value) && value >= 0 ? ` (código ${value})` : '';
}

function classification(service, row) {
  if (!row) return { ready: false, text: 'ausente' };
  if (
    typeof row.State !== 'string' ||
    (row.Health !== undefined &&
      row.Health !== null &&
      typeof row.Health !== 'string')
  ) {
    throw new Error(`estado inválido para o serviço ${service}`);
  }
  const state = row.State.toLowerCase();
  const health = typeof row.Health === 'string' ? row.Health.toLowerCase() : '';
  const code = exitCode(row);
  const suffix = exitCodeSuffix(row);
  if (service === 'mongo-init' && state === 'exited' && code === 0) {
    return { ready: true, text: 'concluído (código 0)' };
  }
  if (service !== 'mongo-init' && state === 'running' && health === 'healthy') {
    return { ready: true, text: 'saudável' };
  }
  if (state === 'exited' && code !== undefined && code > 0) {
    return { ready: false, text: `falho${suffix}` };
  }
  if (['dead', 'restarting'].includes(state) || health === 'unhealthy') {
    return { ready: false, text: `falho${suffix}` };
  }
  if (['created', 'exited', 'paused', 'removing', 'stopped'].includes(state)) {
    return { ready: false, text: `parado${suffix}` };
  }
  if (
    ['created', 'running'].includes(state) &&
    ['', 'starting'].includes(health)
  ) {
    return { ready: false, text: `iniciando${suffix}` };
  }
  return {
    ready: false,
    text: `falho (estado: ${state || 'desconhecido'})${suffix}`,
  };
}

function renderStatus(states, { showUrls = true } = {}) {
  let ready = true;
  for (const service of services) {
    const result = classification(service, states.get(service));
    ready &&= result.ready;
    console.log(`${service}: ${result.text}`);
  }
  if (ready) {
    console.log('stack FinBank pronta.');
    if (showUrls) {
      console.log('Aplicação: http://localhost:8080/');
      console.log('Saúde da API: http://localhost:8080/api/health');
    }
  } else {
    console.error('stack FinBank não está pronta; revise os estados acima.');
  }
  return ready;
}

function printStatus() {
  try {
    return renderStatus(readStates());
  } catch (error) {
    fail(`não foi possível interpretar o estado da stack: ${error.message}`);
  }
}

function ownStackPublishesPort() {
  const result = executeCompose(['ps', '-a', '--format', 'json', 'web'], {
    capture: true,
  });
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(`consulta encerrada pelo sinal ${result.signal}`);
  if (result.status !== 0) {
    const detail = result.stderr?.trim();
    throw new Error(
      `consulta da stack falhou com código ${result.status}${detail ? `: ${detail}` : ''}`,
    );
  }
  let rows;
  try {
    rows = parseComposeJson(result.stdout ?? '');
  } catch (error) {
    throw new Error(
      `não foi possível interpretar a publicação da porta: ${error.message}`,
      { cause: error },
    );
  }
  return rows.some((row) => {
    if (row.Service !== 'web' || String(row.State).toLowerCase() !== 'running')
      return false;
    if (!Array.isArray(row.Publishers)) return false;
    return row.Publishers.some(
      (publisher) =>
        publisher !== null &&
        typeof publisher === 'object' &&
        Number(publisher.PublishedPort) === 8080 &&
        ['127.0.0.1', 'localhost'].includes(publisher.URL),
    );
  });
}

function portIsAvailable() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen({ host: '127.0.0.1', port: 8080, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function inspectPort({ blocking }) {
  let available;
  try {
    available = await portIsAvailable();
  } catch (error) {
    fail(`não foi possível validar a porta 127.0.0.1:8080: ${error.message}`);
  }
  if (available) return;
  try {
    if (ownStackPublishesPort()) return;
  } catch (error) {
    if (blocking) fail(error.message);
    console.warn(`aviso: ${error.message} O stop continuará.`);
    return;
  }
  const message =
    'a porta 127.0.0.1:8080 está ocupada por um processo externo ao project finbank.';
  if (blocking) fail(message);
  console.warn(
    `aviso: ${message} O stop continuará porque não publica portas.`,
  );
}

function diagnoseFailedUp(result, reset) {
  console.error('estado observado após a falha:');
  const statusResult = executeCompose(['ps', '-a', '--format', 'json'], {
    capture: true,
  });
  if (
    !statusResult.error &&
    !statusResult.signal &&
    statusResult.status === 0
  ) {
    try {
      renderStatus(statesFromOutput(statusResult.stdout ?? ''), {
        showUrls: false,
      });
    } catch (error) {
      console.error(`não foi possível interpretar o estado: ${error.message}`);
    }
  } else {
    console.error('não foi possível consultar os serviços após a falha.');
  }
  if (reset) {
    console.error(
      'os volumes finbank_mongo_data e finbank_mongo_config podem já ter sido removidos. Corrija o diagnóstico e execute npm run workshop:reset novamente para recriar a stack.',
    );
  } else {
    console.error(
      'revise as mensagens e os estados acima; após corrigir a causa, execute npm run workshop:start novamente.',
    );
  }
  failFromResult(
    result,
    reset ? 'a stack não convergiu após o reset' : 'a stack não convergiu',
  );
}

function up(reset = false) {
  const result = executeCompose(['up', '--build', '--wait']);
  if (result.error || result.signal || result.status !== 0)
    diagnoseFailedUp(result, reset);
  if (!printStatus()) process.exitCode = 1;
}

if (
  !['start', 'status', 'reset', 'stop'].includes(command) ||
  extraArguments.length > 0
) {
  fail(
    'argumentos inválidos; use somente start, status, reset ou stop, sem argumentos extras.',
  );
}

preflight();

if (command === 'status') {
  process.exitCode = printStatus() ? 0 : 1;
} else if (command === 'start') {
  await inspectPort({ blocking: true });
  up();
} else if (command === 'stop') {
  await inspectPort({ blocking: false });
  compose(['down'], 'não foi possível encerrar a stack');
  console.log(
    'stack FinBank encerrada; os volumes finbank_mongo_data e finbank_mongo_config foram preservados.',
  );
} else {
  await inspectPort({ blocking: true });
  compose(
    ['down', '--volumes', '--remove-orphans'],
    'não foi possível remover os recursos do project finbank',
  );
  up(true);
}
