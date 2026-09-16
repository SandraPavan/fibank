import type { TransactionResponse } from '@finbank/contracts';

/**
 * Sinalizadores visuais para T06 (DEV-034). Deliberadamente simples: a
 * própria fixture `duplicate-retry` (dev/07-dados-e-cenarios.md) descreve
 * a duplicidade como "contingência visual", não como algo que precise de
 * um algoritmo robusto de detecção. Nenhuma das duas funções altera dados
 * nem chama a API — operam só sobre a página de resultados já carregada.
 */

const STALE_REVIEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

/**
 * `REVIEW` há mais de 24h (F07). `now` é injetável para manter os testes
 * deterministas (RNF-02); ao vivo, o padrão é o relógio do navegador —
 * não há endpoint que exponha o `FIXED_CLOCK` do backend.
 */
export function isStaleReview(
  transaction: TransactionResponse,
  now: Date = new Date(),
): boolean {
  if (transaction.status !== 'REVIEW') return false;
  const ageMs = now.getTime() - new Date(transaction.createdAt).getTime();
  return ageMs > STALE_REVIEW_THRESHOLD_MS;
}

/**
 * Marca como possível duplicidade cada transação que compartilha
 * destinatário e valor com outra da mesma página, a poucos minutos de
 * distância — o padrão do cenário `duplicate-retry`. Retorna o conjunto
 * de `transactionId` sinalizados.
 */
export function findPossibleDuplicates(
  transactions: readonly TransactionResponse[],
): ReadonlySet<string> {
  const flagged = new Set<string>();

  for (let i = 0; i < transactions.length; i += 1) {
    for (let j = i + 1; j < transactions.length; j += 1) {
      const a = transactions[i];
      const b = transactions[j];
      if (!a || !b) continue;
      if (a.recipientSnapshot.recipientId !== b.recipientSnapshot.recipientId)
        continue;
      if (a.amountCents !== b.amountCents) continue;

      const deltaMs = Math.abs(
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      if (deltaMs <= DUPLICATE_WINDOW_MS) {
        flagged.add(a.transactionId);
        flagged.add(b.transactionId);
      }
    }
  }

  return flagged;
}
