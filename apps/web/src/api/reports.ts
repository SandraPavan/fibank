/**
 * Cliente para os relatórios públicos de teste (`/reports/*`, gateway
 * nginx montando `artifacts/test-reports/`, DEV-003). Deliberadamente não
 * usa `apiGet`/`http.ts`: aquele módulo fixa o prefixo `/api/v1` e espera
 * corpo `application/problem+json`, e isto aqui é conteúdo estático fora
 * desse contrato.
 */

/**
 * Espelha `SUITES` em `scripts/reports-index.mjs` — mantenha as duas
 * listas sincronizadas manualmente (aquele script roda em Node puro, fora
 * dos workspaces do `package.json` raiz; não vale a pena compartilhar
 * isto via `@finbank/contracts` por 4 strings).
 */
export interface ReportSuiteInfo {
  readonly slug: string;
  readonly label: string;
}

export const REPORT_SUITES: readonly ReportSuiteInfo[] = [
  { slug: 'unit-backend', label: 'Testes unitários — backend' },
  { slug: 'unit-frontend', label: 'Testes unitários — frontend' },
  { slug: 'integration-api', label: 'Integração — API' },
  { slug: 'e2e-system', label: 'E2E — sistema' },
];

/**
 * `runReported()` (scripts/test-reports.mjs) grava `'em execução'` no
 * início e entre passos, só virando `'aprovado'`/`'falhou'` ao final —
 * gerar relatório com a página aberta mostra esse terceiro estado de
 * verdade, não é hipotético.
 */
export type ReportStatus = 'aprovado' | 'falhou' | 'em execução';

export interface ReportSummary {
  readonly startedAt: string;
  readonly status: ReportStatus;
  readonly results: ReadonlyArray<{
    readonly name: string;
    readonly exitCode: number;
  }>;
}

export type ReportSuiteState =
  | { readonly kind: 'not-run' } // 404 — suíte ainda não rodou (checkout novo)
  | { readonly kind: 'summary'; readonly summary: ReportSummary }
  | { readonly kind: 'error' }; // rede indisponível, resposta não-ok ou JSON inválido/parcial

export interface ReportSuite extends ReportSuiteInfo {
  readonly state: ReportSuiteState;
}

async function getReportSuiteState(slug: string): Promise<ReportSuiteState> {
  let response: Response;
  try {
    response = await fetch(`/reports/${slug}/summary.json`);
  } catch {
    return { kind: 'error' };
  }
  if (response.status === 404) return { kind: 'not-run' };
  if (!response.ok) return { kind: 'error' };
  try {
    const summary = (await response.json()) as ReportSummary;
    return { kind: 'summary', summary };
  } catch {
    return { kind: 'error' };
  }
}

export function getAllReportSuiteStates(): Promise<readonly ReportSuite[]> {
  return Promise.all(
    REPORT_SUITES.map(async (suite) => ({
      ...suite,
      state: await getReportSuiteState(suite.slug),
    })),
  );
}

// Os logs são capturados com a saída colorida original dos executores
// (Vitest/Cypress) — sem cor, essas sequências viram ruído visual no meio
// do texto.
// eslint-disable-next-line no-control-regex -- \x1b é o próprio caractere de escape ANSI a remover.
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Texto simples do log de uma etapa (nome vem de `summary.results[].name`)
 * — é onde ficam os nomes reais dos arquivos/cenários testados, algo que
 * `summary.json` não detalha (só guarda um resultado por etapa, não por
 * teste individual). `null` quando o arquivo não existe ou a busca falha.
 */
export async function getReportLog(
  slug: string,
  name: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`/reports/${slug}/${name}.log`);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const text = await response.text();
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}
