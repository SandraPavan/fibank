import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReported } from '../scripts/test-reports.mjs';

test('report conserva falha, saída e remove XML antigo sem executar próxima etapa', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'finbank-reports-'));
  try {
    writeFileSync(join(directory, 'suite.xml'), 'old result');
    const code = await runReported(
      [
        {
          name: 'failure',
          command: process.execPath,
          args: ['-e', 'console.log("evidence"); process.exitCode=7'],
          artifacts: ['suite.xml'],
        },
        {
          name: 'next',
          command: process.execPath,
          args: ['-e', 'process.exitCode=0'],
          artifacts: [],
        },
      ],
      directory,
    );
    assert.equal(code, 7);
    assert.match(
      readFileSync(join(directory, 'failure.log'), 'utf8'),
      /evidence/,
    );
    assert.equal(existsSync(join(directory, 'suite.xml')), false);
    assert.equal(existsSync(join(directory, 'next.log')), false);
    const report = JSON.parse(
      readFileSync(join(directory, 'summary.json'), 'utf8'),
    );
    assert.equal(report.status, 'falhou');
    assert.deepEqual(report.results, [{ name: 'failure', exitCode: 7 }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
