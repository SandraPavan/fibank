import { Inject, Injectable } from '@nestjs/common';
import { ApiProblem } from '../http/problem';
import { WorkspaceRepository } from './workspace.repository';
import { workspaceCookieHeader } from './workspace-context';

const GROUP_SLUG_PATTERN = /^[A-Za-z0-9-]{1,40}$/;
const CODE_PATTERN = /^[A-Za-z0-9]{4,20}$/;

export interface JoinInput {
  groupSlug: string;
  code: string;
}

export function validateJoinInput(body: unknown): JoinInput {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !Object.hasOwn(body, 'groupSlug') ||
    !Object.hasOwn(body, 'code')
  )
    throw new ApiProblem('INVALID_JOIN_INPUT');
  const input = body as Record<string, unknown>;
  if (
    typeof input.groupSlug !== 'string' ||
    !GROUP_SLUG_PATTERN.test(input.groupSlug) ||
    typeof input.code !== 'string' ||
    !CODE_PATTERN.test(input.code)
  )
    throw new ApiProblem('INVALID_JOIN_INPUT');
  return { groupSlug: input.groupSlug, code: input.code };
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
  ) {}

  /**
   * Autentica `{groupSlug, code}` e devolve o cookie de sessão a gravar.
   * Nunca devolve o código de volta nem o `workspaceId` cru — só o rótulo do
   * grupo, para a UI confirmar a sessão sem expor o identificador interno.
   */
  async join(body: unknown): Promise<{ groupSlug: string; cookie: string }> {
    const input = validateJoinInput(body);
    const workspace = await this.workspaces.authenticate(
      input.groupSlug,
      input.code,
    );
    if (!workspace) throw new ApiProblem('WORKSPACE_NOT_FOUND');
    return {
      groupSlug: workspace.groupSlug,
      cookie: workspaceCookieHeader(workspace.workspaceId),
    };
  }
}
