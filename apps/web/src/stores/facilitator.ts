import type {
  WorkspaceMetricsResponse,
  WorkspaceSummaryResponse,
} from '@finbank/contracts';
import { defineStore } from 'pinia';
import {
  getWorkspaceMetrics,
  listFacilitatorWorkspaces,
} from '../api/facilitator';
import { ApiError } from '../api/http';

export interface WorkspaceOverview extends WorkspaceSummaryResponse {
  metrics: WorkspaceMetricsResponse | null;
  metricsError: string | null;
}

interface FacilitatorState {
  /**
   * Só em memória (nunca `localStorage`/`sessionStorage`) — some ao
   * recarregar a página, de propósito (dev/02-arquitetura.md: "o segredo
   * não aparece em... frontend público").
   */
  secret: string | null;
  authenticating: boolean;
  authError: string | null;
  loading: boolean;
  loadError: string | null;
  workspaces: WorkspaceOverview[];
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiError
    ? error.problem.detail || error.problem.title
    : fallback;
}

/**
 * Painel do facilitador (DEV-104). Só leitura: nenhuma action aqui cria,
 * reseta ou aplica cenário — isso continua exclusivo da API/CLI (DEV-004).
 */
export const useFacilitatorStore = defineStore('facilitator', {
  state: (): FacilitatorState => ({
    secret: null,
    authenticating: false,
    authError: null,
    loading: false,
    loadError: null,
    workspaces: [],
  }),
  getters: {
    isAuthenticated: (state) => state.secret !== null,
  },
  actions: {
    /** Valida o segredo consultando a própria lista de grupos. */
    async authenticate(secret: string): Promise<boolean> {
      this.authenticating = true;
      this.authError = null;
      try {
        await listFacilitatorWorkspaces(secret);
        this.secret = secret;
        return true;
      } catch (error) {
        this.authError = messageFor(
          error,
          'Não foi possível validar o segredo.',
        );
        return false;
      } finally {
        this.authenticating = false;
      }
    },

    logout() {
      this.$reset();
    },

    /** Recarrega grupos + métricas de cada um. Chamada pelo polling da view. */
    async refresh(): Promise<void> {
      if (!this.secret) return;
      const secret = this.secret;
      this.loading = true;
      this.loadError = null;
      try {
        const summaries = await listFacilitatorWorkspaces(secret);
        const workspaces = await Promise.all(
          summaries.map(async (summary): Promise<WorkspaceOverview> => {
            try {
              const metrics = await getWorkspaceMetrics(
                summary.groupSlug,
                secret,
              );
              return { ...summary, metrics, metricsError: null };
            } catch (error) {
              return {
                ...summary,
                metrics: null,
                metricsError: messageFor(
                  error,
                  'Não foi possível carregar as métricas deste grupo.',
                ),
              };
            }
          }),
        );
        // Um `logout()` (ou uma nova autenticação) pode ter acontecido
        // enquanto este refresh estava em voo — descarta o resultado em
        // vez de sobrescrever o estado mais recente.
        if (this.secret !== secret) return;
        this.workspaces = workspaces;
      } catch (error) {
        if (this.secret !== secret) return;
        if (
          error instanceof ApiError &&
          error.problem.code === 'INVALID_FACILITATOR_SECRET'
        ) {
          // Segredo pode ter sido trocado no servidor entre uma consulta e
          // outra do polling — volta para a tela de entrada em vez de
          // insistir com um segredo que não vale mais.
          this.secret = null;
          this.authError = 'Segredo inválido ou expirado. Entre novamente.';
        } else {
          this.loadError = messageFor(
            error,
            'Não foi possível carregar os grupos.',
          );
        }
      } finally {
        if (this.secret === secret) this.loading = false;
      }
    },
  },
});
