import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createFinBankRouter } from '../src/router';

describe('router', () => {
  it('redireciona a raiz para o login', async () => {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push('/');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/login');
  });

  it.each([
    ['t01', '/app/transferir'],
    ['t02', '/app/revisar'],
    ['t03', '/app/senha'],
    ['t05', '/app/erro'],
    ['t06', '/app/historico'],
    ['facilitator', '/facilitator'],
  ])('resolve a rota %s em %s', async (name, path) => {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push({ name });
    await router.isReady();

    expect(router.currentRoute.value.path).toBe(path);
  });

  it('resolve a rota t04 com transactionId', async () => {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push({ name: 't04', params: { transactionId: 'tx-1' } });
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/app/comprovante/tx-1');
  });

  it('redireciona /app para o T01', async () => {
    const router = createFinBankRouter(createMemoryHistory());
    await router.push('/app');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/app/transferir');
  });
});
