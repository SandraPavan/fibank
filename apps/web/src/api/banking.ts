import type {
  AccountResponse,
  ConfirmPixIntentRequest,
  CreatePixIntentRequest,
  PixConfirmationResponse,
  PixIntentResponse,
  RecipientResponse,
  TransactionPageResponse,
  TransactionResponse,
  UpdatePixIntentRequest,
} from '@finbank/contracts';
import { apiGet, apiPatch, apiPost } from './http';

/**
 * Tempo máximo de espera pela confirmação antes de tratarmos o resultado
 * como desconhecido (dev/04-fluxos.md — F05/RP-07). O backend pode ainda
 * concluir a operação depois disso; o cliente só para de esperar.
 */
export const CONFIRM_TIMEOUT_MS = 10000;

export function getAccount(): Promise<AccountResponse> {
  return apiGet<AccountResponse>('/accounts/me');
}

export function resolveRecipient(key: string): Promise<RecipientResponse> {
  return apiGet<RecipientResponse>(
    `/recipients/resolve?key=${encodeURIComponent(key)}`,
  );
}

export function getFrequentRecipients(): Promise<RecipientResponse[]> {
  return apiGet<RecipientResponse[]>('/recipients/frequent');
}

export function createPixIntent(
  body: CreatePixIntentRequest,
): Promise<PixIntentResponse> {
  return apiPost<PixIntentResponse>('/pix/intents', body);
}

export function getPixIntent(requestId: string): Promise<PixIntentResponse> {
  return apiGet<PixIntentResponse>(`/pix/intents/${requestId}`);
}

export function updatePixIntent(
  requestId: string,
  body: UpdatePixIntentRequest,
): Promise<PixIntentResponse> {
  return apiPatch<PixIntentResponse>(`/pix/intents/${requestId}`, body);
}

export function confirmPixIntent(
  requestId: string,
  body: ConfirmPixIntentRequest,
): Promise<PixConfirmationResponse> {
  return apiPost<PixConfirmationResponse>(
    `/pix/intents/${requestId}/confirm`,
    body,
    { timeoutMs: CONFIRM_TIMEOUT_MS },
  );
}

export function getTransaction(
  transactionId: string,
): Promise<TransactionResponse> {
  return apiGet<TransactionResponse>(`/transactions/${transactionId}`);
}

/**
 * Espelha os filtros aceitos por `GET /transactions`
 * (`transaction-query.domain.ts`): `from`/`to` são datas de calendário
 * `AAAA-MM-DD`; `status` é um dos estados finais; `type` só aceita
 * `PIX` (único tipo hoje); `pageSize` máximo é 100.
 */
export interface TransactionListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly from?: string;
  readonly to?: string;
  readonly status?: 'APPROVED' | 'REVIEW' | 'REJECTED' | 'FAILED';
  readonly type?: 'PIX';
  readonly search?: string;
}

export function listTransactions(
  query: TransactionListQuery = {},
): Promise<TransactionPageResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const queryString = params.toString();
  const suffix = queryString === '' ? '' : `?${queryString}`;
  return apiGet<TransactionPageResponse>(`/transactions${suffix}`);
}
