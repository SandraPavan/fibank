import { spec } from 'pactum';
import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createApiApplication,
  parseApiHost,
  parseApiPort,
} from '../src/bootstrap';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';

describe('aplicação NestJS', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('inicializa e encerra a aplicação real sem abrir uma porta', async () => {
    app = await createApiApplication();
    await app.init();

    expect(app.getHttpServer()).toBeDefined();
    await app.close();
    app = undefined;
  });

  it.each([
    ['0', false],
    ['65536', false],
    ['1.5', false],
    ['abc', false],
    ['1', true],
    ['65535', true],
  ])('valida API_PORT=%s', (value, valid) => {
    if (valid) {
      expect(parseApiPort(value)).toBe(Number(value));
    } else {
      expect(() => parseApiPort(value)).toThrow(/entre 1 e 65535/);
    }
  });

  it.each([
    [undefined, '127.0.0.1'],
    ['127.0.0.1', '127.0.0.1'],
    ['0.0.0.0', '0.0.0.0'],
  ])('valida API_HOST=%s', (value, expected) => {
    expect(parseApiHost(value)).toBe(expected);
  });

  it('recusa bind da API em interfaces não autorizadas', () => {
    expect(() => parseApiHost('localhost')).toThrow(
      /127\.0\.0\.1 ou 0\.0\.0\.0/,
    );
  });

  it('expõe GET /api/health pela fronteira HTTP real', async () => {
    app = await createApiApplication();
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    await spec()
      .get(`http://127.0.0.1:${String(address.port)}/api/health`)
      .expectStatus(200)
      .expectJson({ status: 'ok' });
  });
});
