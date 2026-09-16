/**
 * Valores monetários trafegam sempre como inteiros em centavos
 * (dev/03-dominio-e-api.md — "não usar ponto flutuante para débito,
 * saldo ou limites").
 */
const formatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/**
 * Extrai centavos de uma entrada digitada, descartando tudo que não for
 * dígito — mesmo padrão de "digitar como em uma calculadora" usado em
 * caixas eletrônicos: cada dígito novo desloca os anteriores.
 */
export function digitsToCents(raw: string): number {
  const digitsOnly = raw.replace(/\D/g, '');
  return digitsOnly === '' ? 0 : Number(digitsOnly);
}
