import { describe, expect, it } from 'vitest';
import { parsePixReviewSlaConfig } from '../src/transactions/pix-review-sla.config';

describe('parsePixReviewSlaConfig', () => {
  it('usa 24h como default quando PIX_REVIEW_SLA_MS não é informado', () => {
    expect(parsePixReviewSlaConfig({})).toEqual({
      reviewSlaMs: 24 * 60 * 60 * 1000,
    });
  });

  it('aceita um limiar configurado', () => {
    expect(parsePixReviewSlaConfig({ PIX_REVIEW_SLA_MS: '3600000' })).toEqual({
      reviewSlaMs: 3600000,
    });
  });

  it.each(['0', '-1', 'abc', '1.5', ''])(
    'rejeita valores inválidos: %s',
    (raw) => {
      expect(() => parsePixReviewSlaConfig({ PIX_REVIEW_SLA_MS: raw })).toThrow(
        'Configuração de SLA inválida.',
      );
    },
  );
});
