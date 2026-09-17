import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Workspace implícito do modo solo/clone-fork (dev/02-arquitetura.md): não
 * exige join nem código de grupo e não tem linha em `Workspace` — é o
 * destino de qualquer requisição sem cookie de sessão válido, preservando
 * o comportamento de instância única das histórias anteriores (G1–G4).
 */
export const DEFAULT_WORKSPACE_ID = 'WS-DEFAULT';
export const WORKSPACE_COOKIE_NAME = 'finbank_workspace';

function sessionSecret(): string {
  return process.env.WORKSPACE_SESSION_KEY ?? 'local-workshop-key';
}

function sign(workspaceId: string): string {
  return createHmac('sha256', sessionSecret())
    .update(workspaceId)
    .digest('hex');
}

/** Token assinado gravado no cookie de sessão; nunca contém o código de entrada. */
export function signWorkspaceToken(workspaceId: string): string {
  return `${workspaceId}.${sign(workspaceId)}`;
}

/**
 * Verifica o token do cookie; qualquer falha (ausente, malformado, assinatura
 * inválida) resulta em `undefined` — o chamador cai no workspace padrão, nunca
 * em erro. Isso impede que um `workspaceId` forjado seja aceito.
 */
export function verifyWorkspaceToken(
  token: string | undefined,
): string | undefined {
  if (!token) return undefined;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return undefined;
  const workspaceId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = Buffer.from(sign(workspaceId), 'hex');
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return undefined;
  }
  if (expected.length !== provided.length) return undefined;
  return timingSafeEqual(expected, provided) ? workspaceId : undefined;
}

export function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function resolveWorkspaceId(cookieHeader: string | undefined): string {
  const token = parseCookie(cookieHeader, WORKSPACE_COOKIE_NAME);
  return verifyWorkspaceToken(token) ?? DEFAULT_WORKSPACE_ID;
}

/**
 * Mesma convenção de `localProfileId(request.rawHeaders)`: os controllers
 * chamam isto para derivar o workspace do cookie da requisição e repassam o
 * resultado, explicitamente, a cada chamada de serviço/repository — nunca um
 * campo do corpo da requisição.
 */
export function workspaceIdFromRequest(request: {
  headers: { cookie?: string };
}): string {
  return resolveWorkspaceId(request.headers.cookie);
}

export function workspaceCookieHeader(workspaceId: string): string {
  const token = signWorkspaceToken(workspaceId);
  return `${WORKSPACE_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function hashJoinCode(groupSlug: string, code: string): string {
  return createHash('sha256').update(`${groupSlug}:${code}`).digest('hex');
}
