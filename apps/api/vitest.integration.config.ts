import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/*.integration.ts'],
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
  },
});
