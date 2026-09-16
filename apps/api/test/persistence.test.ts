import { describe, expect, it, vi } from 'vitest';
import { assertResetAllowed, reset } from '../src/database/seed';
import {
  hashPassword,
  validateRegistration,
  verifyPassword,
} from '../src/database/password';
import { DomainRepository } from '../src/repositories/domain.repository';
import type { PrismaService } from '../src/database/prisma.service';

describe('persistência local: entradas e proteção', () => {
  it.each([
    ['', '123456'],
    [' '.repeat(4), '123456'],
    ['a'.repeat(81), '123456'],
    ['Nome', '12345'],
    ['Nome', 'abcdef'],
    ['Nome', 123456],
  ])('recusa cadastro inválido sem escrever', async (name, password) => {
    const transaction = vi.fn();
    const repository = new DomainRepository({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(repository.register(name, password)).rejects.toThrow(
      'Dados de cadastro inválidos.',
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it('normaliza nome e aceita limites inclusivos', () => {
    expect(validateRegistration(' A ', '012345')).toBe('A');
    expect(validateRegistration('a'.repeat(80), '123456')).toHaveLength(80);
  });
  it('gera hashes com salt independente e verifica senha sem texto claro', async () => {
    const first = await hashPassword('123456');
    const second = await hashPassword('123456');
    expect(first).not.toBe(second);
    expect(first).not.toContain('123456');
    expect(await verifyPassword('123456', first)).toBe(true);
    expect(await verifyPassword('654321', first)).toBe(false);
    expect(await verifyPassword('123456', 'invalid')).toBe(false);
  });
  it.each([
    {},
    { WORKSHOP_MODE: 'false', DATABASE_URL: 'mongodb://mongo/finbank' },
    { WORKSHOP_MODE: 'true', DATABASE_URL: 'mongodb://mongo/other' },
    {
      WORKSHOP_MODE: 'true',
      DATABASE_URL: 'mongodb://mongo/finbank_test_extra',
    },
  ])('recusa reset sem qualquer escrita', async (environment) => {
    const transaction = vi.fn();
    await expect(
      reset(
        { $transaction: transaction } as unknown as PrismaService,
        environment,
      ),
    ).rejects.toThrow('Reset não autorizado.');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('recusa autorização para conexão diferente antes de escrever', async () => {
    const transaction = vi.fn();
    const db = {
      usesConnection: () => false,
      $transaction: transaction,
    } as unknown as PrismaService;
    await expect(
      reset(db, {
        WORKSHOP_MODE: 'true',
        DATABASE_URL: 'mongodb://mongo/finbank_test',
      }),
    ).rejects.toThrow('Reset não autorizado.');
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['finbank', 'finbank_test'])(
    'permite somente banco explícito %s',
    (database) => {
      expect(() =>
        assertResetAllowed({
          WORKSHOP_MODE: 'true',
          DATABASE_URL: `mongodb://mongo/${database}?replicaSet=rs0`,
        }),
      ).not.toThrow();
    },
  );
});
