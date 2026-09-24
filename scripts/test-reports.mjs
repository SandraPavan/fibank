import { spawn } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function runReported(steps, directory) {
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = [];
  const save = (status) => {
    writeFileSync(
      resolve(directory, 'summary.json'),
      JSON.stringify({ startedAt, status, results }, null, 2) + '\n',
    );
    writeFileSync(
      resolve(directory, 'summary.md'),
      [
        '# Relatório de testes',
        '',
        `Início: ${startedAt}`,
        `Estado: ${status}`,
        '',
        ...results.map(
          (result) =>
            `- ${result.name}: ${result.exitCode === 0 ? 'aprovado' : 'falhou'} (código ${result.exitCode}). [Log](${result.name}.log)`,
        ),
        '',
        'Os arquivos XML nesta pasta são relatórios JUnit produzidos pelos executores de teste.',
        '',
      ].join('\n'),
    );
  };
  // Clear only artifacts owned by this invocation, so a failed run cannot expose old results.
  for (const step of steps) {
    for (const artifact of [...step.artifacts, `${step.name}.log`])
      rmSync(resolve(directory, artifact), { force: true });
  }
  save('em execução');
  let interrupted = false;
  for (const step of steps) {
    const log = resolve(directory, `${step.name}.log`);
    writeFileSync(log, '');
    const exitCode = await new Promise((done) => {
      const child = spawn(step.command, step.args, {
        cwd: step.cwd,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
      const interrupt = (signal) => {
        interrupted = true;
        child.kill(signal);
      };
      const onInt = () => interrupt('SIGINT');
      const onTerm = () => interrupt('SIGTERM');
      process.on('SIGINT', onInt);
      process.on('SIGTERM', onTerm);
      for (const [stream, destination] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ])
        stream.on('data', (data) => {
          appendFileSync(log, data);
          destination.write(data);
        });
      child.on('error', (error) => appendFileSync(log, `${error.message}\n`));
      child.on('close', (code, signal) => {
        process.off('SIGINT', onInt);
        process.off('SIGTERM', onTerm);
        done(
          code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1),
        );
      });
    });
    results.push({ name: step.name, exitCode });
    save(exitCode === 0 ? 'em execução' : 'falhou');
    if (exitCode !== 0 || interrupted) {
      save('falhou');
      return exitCode || 1;
    }
  }
  save('aprovado');
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = process.argv[2];

  // `unit`/`docker` alimentam reports/ (consumido pelo ci.yml). Os quatro
  // modos abaixo alimentam artifacts/test-reports/ (consumido pela página
  // pública /reports/, dev/02-arquitetura.md) — pipelines independentes,
  // nenhum dos dois lê ou sobrescreve o outro.
  const publicReportsRoot = resolve(root, 'artifacts', 'test-reports');
  const configs = {
    unit: {
      directory: resolve(root, 'reports', 'unit'),
      steps: [
        {
          name: 'workspaces',
          command: 'npm',
          args: ['run', 'test', '--workspaces'],
          artifacts: ['api.xml', 'web.xml', 'contracts.xml'],
        },
        {
          name: 'foundation',
          command: process.execPath,
          args: [
            '--test',
            '--test-reporter=spec',
            '--test-reporter=junit',
            '--test-reporter-destination=stdout',
            `--test-reporter-destination=${resolve(root, 'reports', 'unit', 'foundation.xml')}`,
            'test/*.test.mjs',
          ],
          artifacts: ['foundation.xml'],
        },
      ],
    },
    docker: {
      directory: resolve(root, 'reports', 'docker'),
      steps: [
        {
          name: 'smoke',
          command: 'sh',
          args: ['test/docker-smoke.sh'],
          artifacts: ['api-integration.xml'],
        },
      ],
    },
    // Os três modos abaixo rodam o script de workspace original, sem
    // acrescentar `--outputFile.junit`: passar essa flag duas vezes (a do
    // workspace + uma nossa) quebra o JUnitReporter do Vitest (ele não
    // sobrescreve, gera um array e derruba o processo). Em vez disso,
    // deixamos o XML cair no lugar de sempre (reports/...) e copiamos para
    // a pasta pública depois.
    'unit-backend': {
      directory: resolve(publicReportsRoot, 'unit-backend'),
      steps: [
        {
          name: 'api',
          command: 'sh',
          args: [
            '-c',
            'npm run test --workspace @finbank/api && mkdir -p artifacts/test-reports/unit-backend && cp reports/unit/api.xml artifacts/test-reports/unit-backend/api.xml',
          ],
          artifacts: ['api.xml'],
        },
      ],
    },
    'unit-frontend': {
      directory: resolve(publicReportsRoot, 'unit-frontend'),
      steps: [
        {
          name: 'web',
          command: 'sh',
          args: [
            '-c',
            'npm run test --workspace @finbank/web && mkdir -p artifacts/test-reports/unit-frontend && cp reports/unit/web.xml artifacts/test-reports/unit-frontend/web.xml',
          ],
          artifacts: ['web.xml'],
        },
      ],
    },
    'integration-api': {
      // `test:integration` sozinho não funciona fora do compose de teste
      // (finbank_test): precisa da stack isolada que `test:docker` já sobe
      // (Mongo próprio, `db push`, rede/volumes descartáveis). Por isso
      // reaproveitamos `test:docker` inteiro aqui, em vez de tentar rodar
      // `test:integration --workspace @finbank/api` direto.
      directory: resolve(publicReportsRoot, 'integration-api'),
      steps: [
        {
          name: 'api-integration',
          command: 'sh',
          args: [
            '-c',
            'npm run test:docker && mkdir -p artifacts/test-reports/integration-api && cp reports/docker/api-integration.xml artifacts/test-reports/integration-api/api-integration.xml',
          ],
          artifacts: ['api-integration.xml'],
        },
      ],
    },
    'e2e-system': {
      // Roda via `cypress/included` (Chrome + todas as dependências de
      // sistema já embutidas na imagem) em vez do binário nativo instalado
      // pelo npm — evita depender do cache do Cypress da máquina local, que
      // pode estar quebrado ou desatualizado. Precisa da stack
      // (`workshop:start`) já no ar.
      //
      // `--network container:finbank-web-1` + `http://localhost:8080` (em
      // vez de `--network finbank_backend` + `http://web:8080`, ou
      // `host.docker.internal`): `crypto.randomUUID()` (usado pra gerar o
      // `requestId` do PIX em pixTransfer.ts) só existe em contexto seguro
      // do navegador — `localhost` conta como seguro mesmo em HTTP puro,
      // qualquer outro host não. Compartilhar a network namespace do
      // próprio container `web` deixa `localhost:8080` resolver pra ele.
      directory: resolve(publicReportsRoot, 'e2e-system'),
      steps: [
        {
          name: 'e2e',
          command: 'docker',
          args: [
            'run',
            '--rm',
            '--network',
            'container:finbank-web-1',
            '-e',
            'CYPRESS_BASE_URL=http://localhost:8080',
            '-v',
            `${root}:/e2e`,
            '-w',
            '/e2e/apps/web',
            `cypress/included:${JSON.parse(readFileSync(resolve(root, 'apps', 'web', 'package.json'), 'utf8')).devDependencies.cypress}`,
            // Sem isso, a imagem roda no Electron (bundle padrão do
            // `cypress run` sem `--browser`), que diverge do que a CI usa
            // (`test:e2e -- --browser chrome`, ci.yml).
            '--browser',
            'chrome',
          ],
          artifacts: [],
        },
      ],
    },
  };

  const config = configs[mode];
  if (!config || process.argv.length !== 3) {
    process.stderr.write(
      `Uso: node scripts/test-reports.mjs ${Object.keys(configs).join('|')}\n`,
    );
    process.exitCode = 1;
  } else {
    process.exitCode = await runReported(
      config.steps.map((step) => ({ ...step, cwd: root })),
      config.directory,
    );
  }
}
