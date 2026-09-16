import { describe, expect, it } from 'vitest';
import type { ServiceInfo } from '../src';

describe('contracts', () => {
  it('disponibiliza contratos TypeScript sem comportamento de domínio', () => {
    const service: ServiceInfo = { name: 'finbank', status: 'ready' };

    expect(service.status).toBe('ready');
  });
});
