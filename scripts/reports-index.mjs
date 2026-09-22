import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function statusSlug(status) {
  return status.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
}

function readCommit(root) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
    })
      .toString()
      .trim();
  } catch {
    return 'desconhecido';
  }
}

function readSummary(baseDir, slug) {
  const path = resolve(baseDir, slug, 'summary.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Só estas quatro pastas — nunca lê facilitator/tests (characterization/
// target, RISK-01–06): dev/12-definition-of-done.md exige que resultado
// reservado nunca apareça em relatório público.
const SUITES = [
  { slug: 'unit-backend', label: 'Testes unitários — backend' },
  { slug: 'unit-frontend', label: 'Testes unitários — frontend' },
  { slug: 'integration-api', label: 'Integração — API' },
  { slug: 'e2e-system', label: 'E2E — sistema' },
];

export function buildIndexHtml(root, generatedAt = new Date().toISOString()) {
  const baseDir = resolve(root, 'artifacts', 'test-reports');
  const commit = readCommit(root);
  const rows = SUITES.map(({ slug, label }) => {
    const summary = readSummary(baseDir, slug);
    return {
      slug,
      label,
      status: summary?.status ?? 'não executado',
      startedAt: summary?.startedAt ?? '—',
    };
  });

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Relatórios de testes — FinBank</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
  .status-aprovado { color: #16794c; font-weight: 600; }
  .status-falhou { color: #b3261e; font-weight: 600; }
  .status-nao-executado { color: #666; }
  footer { margin-top: 2rem; font-size: 0.85rem; color: #666; }
</style>
</head>
<body>
<h1>Relatórios de testes — FinBank</h1>
<p>Gerado em ${escapeHtml(generatedAt)} · commit <code>${escapeHtml(commit)}</code></p>
<table>
<thead><tr><th>Suíte</th><th>Início</th><th>Resultado</th><th>Detalhes</th></tr></thead>
<tbody>
${rows
  .map(
    (row) => `<tr>
  <td>${escapeHtml(row.label)}</td>
  <td>${escapeHtml(row.startedAt)}</td>
  <td class="status-${statusSlug(row.status)}">${escapeHtml(row.status)}</td>
  <td><a href="${row.slug}/summary.md">summary.md</a> · <a href="${row.slug}/summary.json">summary.json</a></td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>
<footer>
  Relatórios públicos, comuns a todos os grupos, somente leitura. Não inclui
  resultados reservados do facilitador.
</footer>
</body>
</html>
`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = resolve(root, 'artifacts', 'test-reports', 'index.html');
  writeFileSync(outputPath, buildIndexHtml(root));
  process.stdout.write(`Índice gerado em ${outputPath}\n`);
}
