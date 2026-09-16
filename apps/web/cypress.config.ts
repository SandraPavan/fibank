import { defineConfig } from 'cypress';

/**
 * Alvo padrão: stack Docker completa em :8080 (dev/08-docker-e-pipeline.md).
 * `CYPRESS_BASE_URL` sobrescreve para apontar a outro ambiente (ex.: `npm
 * run dev` local), seguindo a convenção de variáveis de ambiente do Cypress.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8080',
  },
});
