import type {
  WorkspaceMetricsResponse,
  WorkspaceSummaryResponse,
} from '@finbank/contracts';
import { apiGet } from './http';

/**
 * DEV-104: cliente do painel reservado do facilitador. Todo endpoint sob
 * `/facilitator/*` exige `X-Facilitator-Secret` (`FacilitatorGuard`); esse
 * cliente é o único lugar do frontend que envia esse header — nenhuma tela
 * de participante o conhece.
 */

function secretHeader(secret: string): Record<string, string> {
  return { 'X-Facilitator-Secret': secret };
}

export function listFacilitatorWorkspaces(
  secret: string,
): Promise<WorkspaceSummaryResponse[]> {
  return apiGet<WorkspaceSummaryResponse[]>('/facilitator/workspaces', {
    headers: secretHeader(secret),
  });
}

export function getWorkspaceMetrics(
  groupSlug: string,
  secret: string,
): Promise<WorkspaceMetricsResponse> {
  return apiGet<WorkspaceMetricsResponse>(
    `/facilitator/workspaces/${encodeURIComponent(groupSlug)}/metrics`,
    { headers: secretHeader(secret) },
  );
}
