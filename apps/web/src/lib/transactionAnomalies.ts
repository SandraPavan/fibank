import type { TransactionResponse } from '@finbank/contracts';

/**
 * Sinalizador visual de duplicidade para T06 (DEV-034). Deliberadamente
 * simples: a própria fixture `duplicate-retry` (dev/07-dados-e-cenarios.md)
 * descreve a duplicidade como "contingência visual", não como algo que
 * precise de um algoritmo robusto de detecção. Não altera dados nem chama
 * a API — opera só sobre a página de resultados já carregada.
 *
 * O sinal de "revisão antiga" (F07) deixou de ser calculado aqui a partir
 * da DEV-103 — vem pronto de `TransactionResponse.slaBreached`, calculado
 * no backend com o mesmo relógio (`PersistenceRuntime.now()`) que o resto
 * da API, em vez do relógio do navegador.
 */

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

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
