/**
 * DEV-100 (RF-05): quando a escrita perdedora de uma corrida de `requestId`
 * relê o registro do vencedor, a leitura roda fora da transação abortada e
 * não tem garantia de consistência causal com ela. Tenta algumas vezes
 * antes de desistir, em vez de assumir que a primeira leitura já enxerga o
 * commit concorrente.
 */
export async function retryUntilFound<T>(
  read: () => Promise<T | null>,
  attempts = 5,
  delayMs = 20,
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const found = await read();
    if (found) return found;
    if (attempt < attempts)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}
