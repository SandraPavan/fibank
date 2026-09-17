import type {
  CreatePixIntentRequest,
  UpdatePixIntentRequest,
} from '@finbank/contracts';
import type { Account, PixIntent, Transaction } from '../repositories/models';

export class PixIntentError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PIX_INTENT'
      | 'INSUFFICIENT_BALANCE'
      | 'DAILY_LIMIT_EXCEEDED'
      | 'PIX_INTENT_EXPIRED'
      | 'PIX_INTENT_NOT_EDITABLE'
      | 'REQUEST_ID_CONFLICT',
  ) {
    super(code);
  }
}
function invalid(): never {
  throw new PixIntentError('INVALID_PIX_INTENT');
}
export function validateIntentInput(
  body: unknown,
  patch: false,
): CreatePixIntentRequest;
export function validateIntentInput(
  body: unknown,
  patch: true,
): UpdatePixIntentRequest;
export function validateIntentInput(
  body: unknown,
  patch: boolean,
): CreatePixIntentRequest | UpdatePixIntentRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  const input = body as Record<string, unknown>;
  const allowed = [
    'recipientId',
    'amountCents',
    'deviceId',
    'description',
    ...(patch ? [] : ['requestId']),
  ];
  if (
    !Object.keys(input).length ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    invalid();
  if (
    !patch &&
    ['requestId', 'recipientId', 'amountCents', 'deviceId'].some(
      (key) => !Object.hasOwn(input, key),
    )
  )
    invalid();
  for (const [key, value] of Object.entries(input)) {
    if (key === 'amountCents') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value <= 0 ||
        value > 2147483647
      )
        invalid();
    } else if (key === 'description') {
      if (typeof value !== 'string' || value.length > 140) invalid();
    } else {
      const prefix =
        key === 'requestId' ? 'REQ' : key === 'recipientId' ? 'REC' : 'DEV';
      if (
        typeof value !== 'string' ||
        value.length > 100 ||
        !new RegExp(`^${prefix}-[A-Za-z0-9-]+$`).test(value)
      )
        invalid();
    }
  }
  return { ...(!patch ? { description: '' } : {}), ...input } as
    | CreatePixIntentRequest
    | UpdatePixIntentRequest;
}
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function validateFunds(
  account: Account,
  amountCents: number,
  transactions: readonly Transaction[],
  now: Date,
): void {
  if (amountCents > account.balanceCents)
    throw new PixIntentError('INSUFFICIENT_BALANCE');
  const day = dayFormatter.format(now);
  const approved = transactions
    .filter(
      (tx) =>
        tx.accountId === account.accountId &&
        tx.status === 'APPROVED' &&
        dayFormatter.format(tx.processedAt ?? tx.createdAt) === day,
    )
    .reduce((sum, tx) => sum + tx.amountCents, 0);
  if (approved + amountCents > account.dailyLimitCents)
    throw new PixIntentError('DAILY_LIMIT_EXCEEDED');
}
/**
 * DEV-100 (RF-05/CT36): mesmo `requestId` com o mesmo conteúdo é uma
 * repetição segura; conteúdo diferente é conflito de idempotência.
 */
export function matchesExistingIntent(
  intent: Pick<
    PixIntent,
    'recipientId' | 'amountCents' | 'deviceId' | 'description'
  >,
  input: CreatePixIntentRequest,
): boolean {
  return (
    intent.recipientId === input.recipientId &&
    intent.amountCents === input.amountCents &&
    intent.deviceId === input.deviceId &&
    intent.description === (input.description ?? '')
  );
}
export function validateEditable(intent: PixIntent, now: Date): void {
  if (now >= intent.expiresAt) throw new PixIntentError('PIX_INTENT_EXPIRED');
  if (intent.state !== 'DRAFT' && intent.state !== 'AUTH_PENDING')
    throw new PixIntentError('PIX_INTENT_NOT_EDITABLE');
}
