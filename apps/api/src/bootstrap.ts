import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProblemFilter } from './http/problem';
import { AppModule } from './app.module';

const DEFAULT_API_PORT = 3000;
const DEFAULT_API_HOST = '127.0.0.1';

export function parseApiPort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_API_PORT;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('API_PORT deve ser um número inteiro entre 1 e 65535.');
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT deve ser um número inteiro entre 1 e 65535.');
  }

  return port;
}

export function parseApiHost(value: string | undefined): string {
  const host = value ?? DEFAULT_API_HOST;

  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    throw new Error('API_HOST deve ser 127.0.0.1 ou 0.0.0.0.');
  }

  return host;
}

export async function createApiApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ProblemFilter());
  return app;
}

export async function startApi(): Promise<void> {
  const app = await createApiApplication();

  try {
    await app.listen(
      parseApiPort(process.env.API_PORT),
      parseApiHost(process.env.API_HOST),
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}
