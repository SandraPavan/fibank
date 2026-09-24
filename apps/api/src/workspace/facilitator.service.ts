import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { WorkspaceMetricsResponse } from '@finbank/contracts';
import { PrismaService } from '../database/prisma.service';
import { initialize, reset } from '../database/seed';
import { ApiProblem } from '../http/problem';
import {
  DomainRepository,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../repositories/domain.repository';
import {
  PIX_REVIEW_SLA_CONFIG,
  type PixReviewSlaConfig,
} from '../transactions/pix-review-sla.config';
import { WorkspaceRepository } from './workspace.repository';
import { DEFAULT_WORKSPACE_ID } from './workspace-context';

const GROUP_SLUG_PATTERN = /^[A-Za-z0-9-]{1,40}$/;
const RESERVED_SLUGS = new Set(['default']);
// Sem caracteres ambíguos (0/O, 1/I) para digitação manual do código no join.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  return Array.from(
    randomBytes(6),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('');
}

function validateGroupSlug(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, 'groupSlug')
  )
    throw new ApiProblem('INVALID_WORKSPACE_INPUT');
  const { groupSlug } = body as Record<string, unknown>;
  if (
    typeof groupSlug !== 'string' ||
    !GROUP_SLUG_PATTERN.test(groupSlug) ||
    RESERVED_SLUGS.has(groupSlug)
  )
    throw new ApiProblem('INVALID_WORKSPACE_INPUT');
  return groupSlug;
}

export interface WorkspaceSummary {
  workspaceId: string;
  groupSlug: string;
  createdAt: string;
}

@Injectable()
export class FacilitatorService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
    @Inject(DomainRepository) private readonly repository: DomainRepository,
    @Inject(PERSISTENCE_RUNTIME) private readonly runtime: PersistenceRuntime,
    @Inject(PIX_REVIEW_SLA_CONFIG)
    private readonly slaConfig: PixReviewSlaConfig,
  ) {}

  /** Cria o grupo e já entrega uma baseline pronta (mesma fixture de sempre, isolada por workspace). */
  async createWorkspace(
    body: unknown,
  ): Promise<WorkspaceSummary & { code: string }> {
    const groupSlug = validateGroupSlug(body);
    if (await this.workspaces.findBySlug(groupSlug))
      throw new ApiProblem('GROUP_SLUG_TAKEN');
    const code = generateJoinCode();
    const workspace = await this.workspaces.create(groupSlug, code);
    await initialize(this.db, workspace.workspaceId);
    return {
      workspaceId: workspace.workspaceId,
      groupSlug: workspace.groupSlug,
      createdAt: workspace.createdAt.toISOString(),
      code,
    };
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const workspaces = await this.workspaces.list();
    return workspaces.map((workspace) => ({
      workspaceId: workspace.workspaceId,
      groupSlug: workspace.groupSlug,
      createdAt: workspace.createdAt.toISOString(),
    }));
  }

  /**
   * DEV-103: snapshot atual por workspace, para consumo do painel do
   * facilitador (DEV-104). Reaproveita o mesmo `now`/limiar de SLA que
   * `TransactionService` usa na resposta pública de T06, para não
   * divergir do que os grupos veem. Nunca exposto ao participante — só
   * sob `X-Facilitator-Secret` (`FacilitatorGuard`).
   */
  async metrics(groupSlug: string): Promise<WorkspaceMetricsResponse> {
    const workspace = await this.resolve(groupSlug);
    const counts = await this.repository.transactionMetrics(
      workspace.workspaceId,
      this.runtime.now(),
      this.slaConfig.reviewSlaMs,
    );
    return { groupSlug: workspace.groupSlug, ...counts };
  }

  private async resolve(
    groupSlug: string,
  ): Promise<{ workspaceId: string; groupSlug: string }> {
    if (groupSlug === 'default')
      return { workspaceId: DEFAULT_WORKSPACE_ID, groupSlug: 'default' };
    const workspace = await this.workspaces.findBySlug(groupSlug);
    if (!workspace) throw new ApiProblem('WORKSPACE_NOT_FOUND');
    return workspace;
  }

  /** Reset explícito de um único grupo (ou do `default`) — nunca implícito. */
  async resetWorkspace(
    groupSlug: string,
  ): Promise<{ groupSlug: string; resetAt: string }> {
    const workspace = await this.resolve(groupSlug);
    await reset(this.db, process.env, workspace.workspaceId);
    return {
      groupSlug: workspace.groupSlug,
      resetAt: new Date().toISOString(),
    };
  }

  /** Reset explícito de todos os grupos, incluindo o `default`. */
  async resetAll(): Promise<{ groupSlugs: string[]; resetAt: string }> {
    const workspaces = await this.workspaces.list();
    const targets = [
      { workspaceId: DEFAULT_WORKSPACE_ID, groupSlug: 'default' },
      ...workspaces,
    ];
    for (const target of targets)
      await reset(this.db, process.env, target.workspaceId);
    return {
      groupSlugs: targets.map((target) => target.groupSlug),
      resetAt: new Date().toISOString(),
    };
  }
}
