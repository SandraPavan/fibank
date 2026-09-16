import { createHash } from 'node:crypto';
import type { Recipient, Transaction } from '../repositories/models';
import { BASE_ACCOUNT_ID, recipients as baseRecipients } from '../database/fixtures';

/**
 * Cenários nomeados de `dev/07-dados-e-cenarios.md` /
 * `dev/05-controle-didatico.md`. Cada um é resetável e idempotente:
 * aplicar de novo só reescreve as mesmas linhas (upsert por id
 * determinístico), nunca acumula duplicatas por aplicação repetida —
 * "duplicidade" aqui é um dado do cenário em si (`duplicate-retry`),
 * não um efeito colateral de reaplicar.
 *
 * `timeout-after-commit` não está aqui: não é uma fixture de dados, é
 * uma regra de atraso registrada em runtime (ver `simulation.service`).
 */

export interface ScenarioFixture {
  readonly recipients: readonly Recipient[];
  readonly transactions: readonly Transaction[];
}

// Mesmo padrão de `database/fixtures.ts`: o array base é estático e não
// vazio, então o non-null assertion aqui é seguro.
const primaryRecipient = baseRecipients[0]!;

function snapshotOf(recipient: Recipient) {
  return {
    recipientId: recipient.recipientId,
    name: recipient.name,
    pixKeyMasked: recipient.pixKeyMasked,
    documentMasked: recipient.documentMasked,
    institution: recipient.institution,
  };
}

/** F04/D01 — nove PIX aprovados de R$ 4.900, 2 min entre si, para
 * destinatários diferentes; o décimo é criado ao vivo pelo participante. */
function behaviorPattern(referenceClock: Date): ScenarioFixture {
  const recipients = Array.from({ length: 9 }, (_, index) => {
    const number = index + 1;
    const key = `contraparte-padrao-${number}@example.test`;
    return {
      recipientId: `REC-PATTERN-${String(number).padStart(2, '0')}`,
      name: `Contraparte Padrão ${number}`,
      pixKeyHash: createHash('sha256').update(key).digest('hex'),
      pixKeyMasked: `co***${number}@example.test`,
      documentMasked: '***.999.999-**',
      institution: 'Banco Fictício',
      createdAt: referenceClock,
    };
  });
  const transactions = recipients.map((recipient, index) => {
    const at = new Date(
      referenceClock.getTime() - (recipients.length - index) * 2 * 60 * 1000,
    );
    return {
      transactionId: `TXN-PATTERN-${String(index + 1).padStart(2, '0')}`,
      requestId: `REQ-PATTERN-${String(index + 1).padStart(2, '0')}`,
      accountId: BASE_ACCOUNT_ID,
      recipientSnapshot: snapshotOf(recipient),
      amountCents: 490000,
      description: 'Pagamento fictício',
      deviceId: 'DEV-1001',
      status: 'APPROVED' as const,
      riskScore: 10,
      reasonCodes: ['WITHIN_CURRENT_RULES'],
      createdAt: at,
      updatedAt: at,
      processedAt: at,
    };
  });
  return { recipients, transactions };
}

/** F07/D04 — transação REVIEW há mais de 24h, sem SLA/escalonamento. */
function staleReview(referenceClock: Date): ScenarioFixture {
  const at = new Date(referenceClock.getTime() - 25 * 60 * 60 * 1000);
  const transaction: Transaction = {
    transactionId: 'TXN-STALE-REVIEW',
    requestId: 'REQ-STALE-REVIEW',
    accountId: BASE_ACCOUNT_ID,
    recipientSnapshot: snapshotOf(primaryRecipient),
    amountCents: 250000,
    description: 'Pagamento fictício',
    deviceId: 'DEV-1001',
    status: 'REVIEW',
    riskScore: 80,
    reasonCodes: ['AMOUNT_REQUIRES_REVIEW'],
    createdAt: at,
    updatedAt: at,
    processedAt: null,
  };
  return { recipients: [], transactions: [transaction] };
}

/** F05/F08 — duas operações de mesmo valor/destinatário/descrição, a
 * segundos de distância, `requestId` distintos ("contingência visual"
 * caso o timeout ao vivo não seja produzido). */
function duplicateRetry(referenceClock: Date): ScenarioFixture {
  const first = new Date(referenceClock.getTime() - 5000);
  const second = referenceClock;
  const build = (suffix: string, at: Date): Transaction => ({
    transactionId: `TXN-DUPLICATE-${suffix}`,
    requestId: `REQ-DUPLICATE-${suffix}`,
    accountId: BASE_ACCOUNT_ID,
    recipientSnapshot: snapshotOf(primaryRecipient),
    amountCents: 875000,
    description: 'Pagamento fictício',
    deviceId: 'DEV-1001',
    status: 'APPROVED',
    riskScore: 10,
    reasonCodes: ['WITHIN_CURRENT_RULES'],
    createdAt: at,
    updatedAt: at,
    processedAt: at,
  });
  return {
    recipients: [],
    transactions: [build('A', first), build('B', second)],
  };
}

/** F06/D05 — operação consistente com o histórico do cliente, mas de um
 * dispositivo fora de `knownDeviceIds`; a demonstração em si acontece ao
 * vivo (confirmação real com `deviceId: 'DEV-NEW-01'`), esta fixture só
 * dá contexto histórico ao facilitador. */
function newDeviceLegitimate(referenceClock: Date): ScenarioFixture {
  const at = referenceClock;
  const transaction: Transaction = {
    transactionId: 'TXN-NEW-DEVICE',
    requestId: 'REQ-NEW-DEVICE',
    accountId: BASE_ACCOUNT_ID,
    recipientSnapshot: snapshotOf(primaryRecipient),
    amountCents: 45000,
    description: 'Pagamento fictício',
    deviceId: 'DEV-NEW-01',
    status: 'APPROVED',
    riskScore: 10,
    reasonCodes: ['WITHIN_CURRENT_RULES'],
    createdAt: at,
    updatedAt: at,
    processedAt: at,
  };
  return { recipients: [], transactions: [transaction] };
}

export const DATA_SCENARIOS: Readonly<
  Record<string, (referenceClock: Date) => ScenarioFixture>
> = Object.freeze({
  'behavior-pattern': behaviorPattern,
  'stale-review': staleReview,
  'duplicate-retry': duplicateRetry,
  'new-device-legitimate': newDeviceLegitimate,
});

export const TIMEOUT_SCENARIO_ID = 'timeout-after-commit';
