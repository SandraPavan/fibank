import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDeviceId } from '../../src/api/device';

describe('getDeviceId', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('gera e persiste um id na primeira chamada', () => {
    const id = getDeviceId();

    expect(id).toMatch(/^DEV-[0-9a-f-]{36}$/);
    expect(window.localStorage.getItem('finbank:device-id')).toBe(id);
  });

  it('reutiliza o mesmo id em chamadas subsequentes', () => {
    const first = getDeviceId();
    const second = getDeviceId();

    expect(second).toBe(first);
  });
});
