import 'reflect-metadata';
import { startApi } from './bootstrap';

void startApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falha ao iniciar a API: ${message}`);
  process.exitCode = 1;
});
