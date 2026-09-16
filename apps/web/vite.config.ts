import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // Espelha o proxy /api do nginx.conf de produção (DEV-002/003)
      // para o servidor de desenvolvimento do Vite.
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? '3000'}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
