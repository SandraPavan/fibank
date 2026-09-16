import { describe, expect, it } from 'vitest';
import { digitsToCents, formatCents } from '../../src/lib/currency';

describe('formatCents', () => {
  it('formata centavos como moeda pt-BR', () => {
    expect(formatCents(123456)).toBe('R$ 1.234,56');
  });

  it('formata zero corretamente', () => {
    expect(formatCents(0)).toBe('R$ 0,00');
  });
});

describe('digitsToCents', () => {
  it('extrai apenas dígitos, descartando o restante', () => {
    expect(digitsToCents('R$ 1.234,56')).toBe(123456);
  });

  it('trata entrada vazia como zero', () => {
    expect(digitsToCents('')).toBe(0);
  });

  it('desloca dígitos como uma entrada de calculadora', () => {
    expect(digitsToCents('1')).toBe(1);
    expect(digitsToCents('12')).toBe(12);
    expect(digitsToCents('123')).toBe(123);
  });
});
