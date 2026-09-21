export type ServiceStatus = 'ready';

export interface ServiceInfo {
  readonly name: string;
  readonly status: ServiceStatus;
}

export interface CreateProfileRequest {
  displayName: string;
  transactionPassword: string;
}
export interface ProfileResponse {
  profileId: string;
  displayName: string;
  accountId: string;
}
export interface AccountResponse {
  accountId: string;
  profileId: string;
  ownerName: string;
  documentMasked: string;
  balanceCents: number;
  dailyLimitCents: number;
}
export interface RecipientResponse {
  recipientId: string;
  name: string;
  pixKeyMasked: string;
  documentMasked: string;
  institution: string;
}
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  traceId: string;
}

export interface CreatePixIntentRequest {
  requestId: string;
  recipientId: string;
  amountCents: number;
  deviceId: string;
  description?: string;
}
export type UpdatePixIntentRequest = Partial<
  Omit<CreatePixIntentRequest, 'requestId'>
>;
export interface PixIntentResponse {
  requestId: string;
  accountId: string;
  recipientId: string;
  amountCents: number;
  description: string;
  deviceId: string;
  state:
    | 'DRAFT'
    | 'AUTH_PENDING'
    | 'PROCESSING'
    | 'APPROVED'
    | 'REVIEW'
    | 'REJECTED'
    | 'FAILED';
  createdAt: string;
  expiresAt: string;
}

export interface ConfirmPixIntentRequest {
  transactionPassword: string;
}
export interface PixConfirmationResponse {
  requestId: string;
  transactionId: string;
  status: 'APPROVED' | 'REVIEW';
  reasonCodes: string[];
  processedAt: string;
}

export interface PixRequestStatusResponse {
  requestId: string;
  status: 'PENDING' | 'APPROVED' | 'REVIEW' | 'REJECTED' | 'FAILED';
  transactionId: string | null;
  reasonCodes: string[];
  processedAt: string | null;
}

export interface TransactionResponse {
  transactionId: string;
  requestId: string;
  type: 'PIX';
  recipientSnapshot: RecipientResponse;
  amountCents: number;
  description: string;
  status: 'APPROVED' | 'REVIEW' | 'REJECTED' | 'FAILED';
  reasonCodes: string[];
  createdAt: string;
  processedAt: string | null;
  /** DEV-103 (F07/GAP08): só preenchido para `status === 'REVIEW'`. */
  ageMs: number | null;
  /** DEV-103 (F07/GAP08): `ageMs` acima do limiar de SLA configurado. */
  slaBreached: boolean;
}
export interface TransactionPageResponse {
  items: TransactionResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface WorkspaceMetricsResponse {
  groupSlug: string;
  approved: number;
  review: number;
  reviewSlaBreached: number;
  rejected: number;
  failed: number;
}

export interface JoinSessionRequest {
  groupSlug: string;
  code: string;
}
export interface JoinSessionResponse {
  groupSlug: string;
}
