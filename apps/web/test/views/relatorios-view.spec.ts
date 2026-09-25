import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import * as reports from '../../src/api/reports';
import type { ReportSuite } from '../../src/api/reports';
import { createFinBankRouter } from '../../src/router';
import RelatoriosView from '../../src/views/RelatoriosView.vue';

vi.mock('../../src/api/reports', async () => {
  const actual = await vi.importActual<typeof import('../../src/api/reports')>(
    '../../src/api/reports',
  );
  return {
    ...actual,
    getAllReportSuiteStates: vi.fn(),
    getReportLog: vi.fn(),
  };
});

function suite(overrides: Partial<ReportSuite>): ReportSuite {
  return {
    slug: 'unit-backend',
    label: 'Testes unitários — backend',
    state: { kind: 'not-run' },
    ...overrides,
  };
}

async function mountView() {
  const router = createFinBankRouter(createMemoryHistory());
  await router.push('/app/relatorios');
  await router.isReady();

  const wrapper = mount(RelatoriosView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('RelatoriosView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('exibe as quatro suítes aprovadas, com botão de ver cenários e link de download', async () => {
    const results = reports.REPORT_SUITES.map((info) =>
      suite({
        ...info,
        state: {
          kind: 'summary',
          summary: {
            startedAt: '2026-09-22T01:02:40.169Z',
            status: 'aprovado',
            results: [{ name: 'api', exitCode: 0 }],
          },
        },
      }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();

    for (const info of reports.REPORT_SUITES) {
      expect(wrapper.text()).toContain(info.label);
    }
    expect(wrapper.text()).toContain('Aprovado');
    expect(wrapper.text()).not.toContain('suíte(s) com falha');
    expect(wrapper.text()).toContain('Ver cenários testados');

    const downloadLink = wrapper
      .findAll('a')
      .find((a) => a.attributes('href') === '/reports/unit-backend/api.log');
    expect(downloadLink).toBeDefined();
    expect(downloadLink?.attributes('download')).toBeDefined();
  });

  it('"Ver cenários testados" busca e exibe o log sem sair do app', async () => {
    const results = reports.REPORT_SUITES.map((info) =>
      suite({
        ...info,
        state: {
          kind: 'summary',
          summary: {
            startedAt: '2026-09-22T01:02:40.169Z',
            status: 'aprovado',
            results: [{ name: 'api', exitCode: 0 }],
          },
        },
      }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);
    vi.mocked(reports.getReportLog).mockResolvedValue(
      '✓ test/pix-intent.test.ts (3 tests)',
    );

    const { wrapper } = await mountView();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ver cenários testados')
      ?.trigger('click');
    await flushPromises();

    expect(reports.getReportLog).toHaveBeenCalledWith('unit-backend', 'api');
    expect(wrapper.text()).toContain('test/pix-intent.test.ts (3 tests)');
    expect(wrapper.text()).toContain('Ocultar cenários testados');
  });

  it('sinaliza suíte com falha no banner de atenção', async () => {
    const results = reports.REPORT_SUITES.map((info, index) =>
      suite({
        ...info,
        state: {
          kind: 'summary',
          summary: {
            startedAt: '2026-09-22T01:02:40.169Z',
            status: index === 0 ? 'falhou' : 'aprovado',
            results: [{ name: 'x', exitCode: index === 0 ? 1 : 0 }],
          },
        },
      }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Falhou');
    expect(wrapper.text()).toContain('1 suíte(s) com falha.');
  });

  it('mostra "Em execução" para uma suíte em andamento', async () => {
    const results = reports.REPORT_SUITES.map((info, index) =>
      suite({
        ...info,
        state:
          index === 0
            ? {
                kind: 'summary',
                summary: {
                  startedAt: '2026-09-22T01:02:40.169Z',
                  status: 'em execução',
                  results: [],
                },
              }
            : { kind: 'not-run' },
      }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Em execução');
    expect(wrapper.text()).not.toContain('Falhou');
  });

  it('mostra "Não executado" para suíte ainda sem relatório, sem links de detalhe', async () => {
    const results = reports.REPORT_SUITES.map((info) =>
      suite({ ...info, state: { kind: 'not-run' } }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain('Não executado');
    expect(wrapper.text()).not.toContain('Ver cenários testados');
    expect(
      wrapper.findAll('a').find((a) => a.attributes('href')?.includes('.log')),
    ).toBeUndefined();
  });

  it('mostra erro fatal quando as quatro suítes estão indisponíveis', async () => {
    const results = reports.REPORT_SUITES.map((info) =>
      suite({ ...info, state: { kind: 'error' } }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain(
      'Não foi possível carregar os relatórios de teste',
    );
  });

  it('botão "Atualizar" busca os relatórios novamente', async () => {
    const results = reports.REPORT_SUITES.map((info) =>
      suite({ ...info, state: { kind: 'not-run' } }),
    );
    vi.mocked(reports.getAllReportSuiteStates).mockResolvedValue(results);

    const { wrapper } = await mountView();
    expect(reports.getAllReportSuiteStates).toHaveBeenCalledTimes(1);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Atualizar')
      ?.trigger('click');
    await flushPromises();

    expect(reports.getAllReportSuiteStates).toHaveBeenCalledTimes(2);
  });
});
