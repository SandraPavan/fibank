import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compose = await readFile('compose.yaml', 'utf8');
const mongoInit = await readFile('docker/mongo/init-replica-set.sh', 'utf8');
const apiDockerfile = await readFile('apps/api/Dockerfile', 'utf8');
const webDockerfile = await readFile('apps/web/Dockerfile', 'utf8');
const nginx = await readFile('apps/web/nginx.conf', 'utf8');
const dockerignore = await readFile('.dockerignore', 'utf8');

function serviceBlock(name, nextName) {
  const start = compose.indexOf(`  ${name}:`);
  const end = nextName
    ? compose.indexOf(`  ${nextName}:`, start)
    : compose.indexOf('\nnetworks:', start);
  assert.notEqual(start, -1, `serviço ${name} deve existir`);
  assert.notEqual(end, -1, `fim do serviço ${name} deve existir`);
  return compose.slice(start, end);
}

test('Compose é pinado, determinístico e não contém segredos', () => {
  assert.match(compose, /^name: finbank$/m);
  assert.doesNotMatch(compose, /(?:^|:)latest(?:\s|$)/m);
  assert.doesNotMatch(compose, /(password|secret|token|api[_-]?key)/i);
  assert.equal((compose.match(/image: mongo:8\.0\.16-noble/g) ?? []).length, 2);
  assert.match(compose, /name: finbank_mongo_data/);
  assert.match(compose, /name: finbank_mongo_config/);
  assert.match(compose, /name: finbank_backend/);
});

test('Mongo usa somente os dois volumes persistentes explicitamente nomeados', () => {
  const mongo = serviceBlock('mongo', 'mongo-init');
  const mounts = [...mongo.matchAll(/^\s+- ([^:\s]+):(\/data\/[^\s]+)$/gm)].map(
    (match) => `${match[1]}:${match[2]}`,
  );

  assert.deepEqual(mounts, [
    'mongo-data:/data/db',
    'mongo-config:/data/configdb',
  ]);
  assert.equal((compose.match(/^\s{2}mongo-data:$/gm) ?? []).length, 1);
  assert.equal((compose.match(/^\s{2}mongo-config:$/gm) ?? []).length, 1);
});

test('Compose consome configuração local com defaults seguros', () => {
  assert.match(
    compose,
    /MONGO_INIT_MAX_ATTEMPTS: '\$\{MONGO_INIT_MAX_ATTEMPTS:-60\}'/,
  );
  assert.match(compose, /API_HOST: 0\.0\.0\.0/);
  assert.match(compose, /API_PORT: '\$\{API_PORT:-3000\}'/);
});

test('acesso pelo host publica somente web em 127.0.0.1:8080', () => {
  const mongo = serviceBlock('mongo', 'mongo-init');
  const mongoInitService = serviceBlock('mongo-init', 'api');
  const api = serviceBlock('api', 'web');
  const web = serviceBlock('web');

  assert.doesNotMatch(mongo, /\n\s+ports:/);
  assert.doesNotMatch(mongoInitService, /\n\s+ports:/);
  assert.doesNotMatch(api, /\n\s+ports:/);
  assert.match(web, /['"]127\.0\.0\.1:8080:8080['"]/);
  assert.equal((compose.match(/\n\s+ports:/g) ?? []).length, 1);
});

test('primeira subida depende de saúde real e da conclusão do inicializador', () => {
  assert.match(
    serviceBlock('mongo', 'mongo-init'),
    /mongosh[\s\S]*adminCommand/,
  );
  assert.match(serviceBlock('mongo-init', 'api'), /condition: service_healthy/);
  assert.match(
    serviceBlock('api', 'web'),
    /condition: service_completed_successfully/,
  );
  assert.match(serviceBlock('web'), /condition: service_healthy/);
  assert.doesNotMatch(compose, /healthcheck:[\s\S]*\bsleep\b/);
});

test('volume vazio inicia replica set e subida repetida converge sem recriar dados', () => {
  assert.match(mongoInit, /NOT_INITIALIZED[\s\S]*rs\.initiate/);
  assert.match(mongoInit, /replica set já está PRIMARY/);
  assert.match(mongoInit, /replica set já iniciado; aguardando eleição/);
  assert.match(mongoInit, /max_attempts/);
  assert.match(
    mongoInit,
    /MONGO_INIT_MAX_ATTEMPTS deve ser um inteiro positivo/,
  );
  assert.match(mongoInit, /0\|2\|3\|5\|6\|7\|9\|10/);
  assert.match(mongoInit, /não elegeu PRIMARY/);
  assert.doesNotMatch(mongoInit, /rm\s|dropDatabase|reconfig/);
});

test('.dockerignore exclui todas as variantes de ambiente', () => {
  assert.match(dockerignore, /^\*\*\/\.env\*$/m);
  assert.doesNotMatch(dockerignore, /^!.*\.env/m);
});

test('Mongo indisponível impede avanço e produz diagnóstico limitado', () => {
  assert.match(mongoInit, /MongoDB não respondeu ao ping após/);
  assert.match(mongoInit, /exit 1/);
  assert.match(serviceBlock('mongo-init', 'api'), /condition: service_healthy/);
});

test('API indisponível mantém gateway não saudável', () => {
  const web = serviceBlock('web');
  assert.match(web, /wget[^\n]+\/api\/health/);
  assert.match(web, /&&/);
  assert.match(nginx, /location \/api\//);
  assert.match(nginx, /proxy_pass http:\/\/api:\$\{API_PORT\}/);
});

test('imagens são multi-stage e processos finais não usam root', () => {
  assert.match(apiDockerfile, /^FROM .+ AS dependencies$/m);
  assert.match(apiDockerfile, /^FROM .+ AS build$/m);
  assert.match(
    apiDockerfile,
    /^FROM node:24\.15\.0-bookworm-slim AS dependencies$/m,
  );
  assert.match(
    apiDockerfile,
    /^FROM node:24\.15\.0-bookworm-slim AS runtime$/m,
  );
  assert.equal(
    (apiDockerfile.match(/npm install --global npm@11\.9\.0/g) ?? []).length,
    2,
  );
  assert.match(apiDockerfile, /^USER node$/m);
  assert.match(webDockerfile, /^FROM .+ AS dependencies$/m);
  assert.match(webDockerfile, /^FROM .+ AS build$/m);
  assert.match(
    webDockerfile,
    /^FROM node:24\.15\.0-bookworm-slim AS dependencies$/m,
  );
  assert.match(
    webDockerfile,
    /^FROM nginxinc\/nginx-unprivileged:1\.29\.3-alpine AS runtime$/m,
  );
  assert.match(webDockerfile, /npm install --global npm@11\.9\.0/);
  assert.match(webDockerfile, /^USER nginx$/m);
});

test('runtime inclui client gerado e inicializa baseline sem seed a cada restart', () => {
  assert.match(apiDockerfile, /prisma:generate/);
  assert.match(apiDockerfile, /COPY --from=build[^\n]*node_modules\/\.prisma/);
  assert.match(compose, /db:push/);
  assert.match(compose, /db:initialize/);
  assert.doesNotMatch(compose, /db:seed|db:reset/);
});
