import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiGet,
  apiPatch,
  apiPost,
  ApiError,
  RequestTimeoutError,
} from '../../src/api/http';

describe('http client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('faz GET em /api/v1 e retorna o JSON decodificado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiGet<{ ok: boolean }>('/accounts/me');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/accounts/me',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('envia POST com corpo serializado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ requestId: 'r1' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiPost('/pix/intents', { amountCents: 100 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/pix/intents',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amountCents: 100 }),
      }),
    );
  });

  it('envia PATCH com corpo serializado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ requestId: 'r1' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiPatch('/pix/intents/r1', { amountCents: 200 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/pix/intents/r1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ amountCents: 200 }),
      }),
    );
  });

  it('lança ApiError com o problem+json em respostas de erro', async () => {
    const problem = {
      type: 'urn:finbank:problem:recipient_not_found',
      title: 'Destinatário não encontrado',
      status: 404,
      code: 'RECIPIENT_NOT_FOUND',
      detail: 'O destinatário não foi encontrado.',
      requestId: 'req-1',
      traceId: 'trace-1',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(problem), { status: 404 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      await apiGet('/recipients/resolve?key=x');
      expect.unreachable('deveria ter lançado ApiError');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).problem).toEqual(problem);
    }
  });

  it('lança RequestTimeoutError quando a resposta demora além do timeout (F05/RP-07)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiPost(
      '/pix/intents/req-1/confirm',
      { transactionPassword: '123456' },
      { timeoutMs: 1000 },
    );
    const assertion =
      expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('não usa AbortController quando nenhum timeout é passado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await apiGet('/accounts/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });
});
