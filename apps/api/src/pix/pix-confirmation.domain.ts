import type { ConfirmPixIntentRequest } from '@finbank/contracts';
import { verifyPassword } from '../database/password';
import type { PixIntent } from '../repositories/models';

export class PixConfirmationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_PIX_CONFIRMATION'
      | 'INVALID_TRANSACTION_PASSWORD'
      | 'PIX_INTENT_EXPIRED'
      | 'PIX_INTENT_NOT_CONFIRMABLE',
  ) {
    super(code);
  }
}
export function validateConfirmationInput(
  body: unknown,
): ConfirmPixIntentRequest {
  if (body === undefined)
    throw new PixConfirmationError('INVALID_TRANSACTION_PASSWORD');
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'transactionPassword')
  )
    throw new PixConfirmationError('INVALID_PIX_CONFIRMATION');
  const password = (body as Record<string, unknown>).transactionPassword;
  if (typeof password !== 'string' || !/^\d{6}$/.test(password))
    throw new PixConfirmationError('INVALID_TRANSACTION_PASSWORD');
  return { transactionPassword: password };
}
export async function authenticateConfirmation(
  password: string,
  hash: string,
): Promise<void> {
  if (!(await verifyPassword(password, hash)))
    throw new PixConfirmationError('INVALID_TRANSACTION_PASSWORD');
}
export function validateConfirmable(intent: PixIntent, now: Date): void {
  if (now >= intent.expiresAt)
    throw new PixConfirmationError('PIX_INTENT_EXPIRED');
  if (intent.state !== 'DRAFT' && intent.state !== 'AUTH_PENDING')
    throw new PixConfirmationError('PIX_INTENT_NOT_CONFIRMABLE');
}
