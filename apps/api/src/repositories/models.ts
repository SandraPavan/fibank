export type PixState =
  | 'DRAFT'
  | 'AUTH_PENDING'
  | 'PROCESSING'
  | 'APPROVED'
  | 'REVIEW'
  | 'REJECTED'
  | 'FAILED';
export interface LocalProfile {
  profileId: string;
  displayName: string;
}
export interface Account {
  accountId: string;
  profileId: string;
  ownerName: string;
  documentMasked: string;
  balanceCents: number;
  dailyLimitCents: number;
  transactionPasswordHash: string;
  knownDeviceIds: string[];
}
export interface RecipientSnapshot {
  recipientId: string;
  name: string;
  pixKeyMasked: string;
  documentMasked: string;
  institution: string;
}
export interface Recipient extends RecipientSnapshot {
  pixKeyHash: string;
  createdAt: Date;
}
export interface PixIntent {
  intentId: string;
  requestId: string;
  accountId: string;
  recipientId: string;
  amountCents: number;
  description: string;
  deviceId: string;
  state: PixState;
  createdAt: Date;
  expiresAt: Date;
}
export interface Transaction {
  transactionId: string;
  requestId: string;
  accountId: string;
  recipientSnapshot: RecipientSnapshot;
  amountCents: number;
  description: string;
  deviceId: string;
  status: PixState;
  riskScore: number | null;
  reasonCodes: string[];
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}
