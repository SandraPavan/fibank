import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
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
  if (!['unit', 'docker'].includes(mode) || process.argv.length !== 3) {
    process.stderr.write('Uso: node scripts/test-reports.mjs unit|docker\n');
    process.exitCode = 1;
  } else {
    const directory = resolve(root, 'reports', mode);
    const steps =
      mode === 'docker'
        ? [
            {
              name: 'smoke',
              command: 'sh',
              args: ['test/docker-smoke.sh'],
              artifacts: ['api-integration.xml'],
            },
          ]
        : [
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
                `--test-reporter-destination=${resolve(directory, 'foundation.xml')}`,
                'test/*.test.mjs',
              ],
              artifacts: ['foundation.xml'],
            },
          ];
    process.exitCode = await runReported(
      steps.map((step) => ({ ...step, cwd: root })),
      directory,
    );
  }
}
