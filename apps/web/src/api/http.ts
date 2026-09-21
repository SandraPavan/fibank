import type { ProblemDetails } from '@finbank/contracts';

/**
 * Erro de API tipado: carrega o `application/problem+json` retornado pelo
 * backend (dev/03-dominio-e-api.md) para que a UI possa reagir ao `code`
 * (ex.: `INVALID_PIX_KEY`, `RECIPIENT_NOT_FOUND`) sem reanalisar strings.
 */
export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }
}

/**
 * O cliente não recebeu uma resposta estruturada a tempo — não significa
 * que o backend não processou a solicitação (dev/04-fluxos.md — F05).
 * Distinto de `ApiError`: aqui não há `problem` nenhum para interpretar.
 */
export class RequestTimeoutError extends Error {
  constructor() {
    super('A solicitação não recebeu resposta a tempo.');
    this.name = 'RequestTimeoutError';
  }
}

const API_BASE = '/api/v1';

interface RequestOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const controller = options?.timeoutMs ? new AbortController() : undefined;
  const timer = controller
    ? setTimeout(() => controller.abort(), options?.timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
        ...init?.headers,
      },
    });
  } catch (error) {
    if (controller?.signal.aborted) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const problem = (await response
      .json()
      .catch(() => null)) as ProblemDetails | null;
    throw new ApiError(
      problem ?? {
        type: 'about:blank',
        title: response.statusText,
        status: response.status,
        code: 'UNKNOWN_ERROR',
        detail: '',
        requestId: '',
        traceId: '',
      },
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, undefined, options);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    options,
  );
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
