import { defineConfig } from 'vitest/config';

/**
 * Mesmo padrão de `apps/api/vitest.integration.config.ts`: os arquivos
 * compartilham `finbank_test` e fazem reset a cada teste, então
 * `fileParallelism: false` evita que dois arquivos rodando ao mesmo tempo
 * pisem no reset um do outro.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['tests/characterization/*.ts', 'tests/target/*.ts'],
    fileParallelism: false,
  },
});
