import 'reflect-metadata';
import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { ProblemFilter } from '../src/http/problem';
import { describe, expect, it, vi } from 'vitest';
import { localProfileId, pixKey } from '../src/http/local-profile.context';
import {
  LocalBankingService,
  publicAccount,
  publicRecipient,
} from '../src/http/local-banking.service';
import { DomainRepository } from '../src/repositories/domain.repository';
import { recipients } from '../src/database/fixtures';

describe('fronteira local', () => {
  it.each([[[]], [['X-Local-Profile-Id', 'PRO-ab-12']]])(
    'aceita contexto válido %j',
    (headers) => {
      expect(localProfileId(headers)).toBe(headers[1] ?? 'PRO-1001');
    },
  );
  it.each(['', 'PRO-', 'PRO-1, PRO-2', 'pro-1', 'PRO-1 '])(
    'rejeita contexto malformado',
    (value) => {
      expect(() => localProfileId(['X-Local-Profile-Id', value])).toThrow(
        'INVALID_LOCAL_PROFILE',
      );
    },
  );
  it('rejeita headers repetidos mesmo idênticos', () => {
    expect(() =>
      localProfileId([
        'X-Local-Profile-Id',
        'PRO-1',
        'x-local-profile-id',
        'PRO-1',
      ]),
    ).toThrow('INVALID_LOCAL_PROFILE');
  });
  it.each([
    undefined,
    '',
    [],
    {},
    [['marina@example.test']],
    'bad',
    'a@b',
    'a b@example.test',
    '.a@example.test',
    'a.@example.test',
    'a..b@example.test',
    `${'a'.repeat(65)}@example.test`,
    `a@${'b'.repeat(64)}.test`,
  ])('rejeita chave inválida sem eco', (key) => {
    expect(() => pixKey({ key })).toThrow('INVALID_PIX_KEY');
  });
  it('projeta somente campos públicos', () => {
    expect(Object.keys(publicRecipient(recipients[0]!)).sort()).toEqual([
      'documentMasked',
      'institution',
      'name',
      'pixKeyMasked',
      'recipientId',
    ]);
    const account = publicAccount({
      accountId: 'ACC-1',
      profileId: 'PRO-1',
      ownerName: 'Exemplo',
      documentMasked: '***',
      balanceCents: 1,
      dailyLimitCents: 2,
      transactionPasswordHash: 'secret',
      knownDeviceIds: ['secret'],
    });
    expect(Object.keys(account).sort()).toEqual([
      'accountId',
      'balanceCents',
      'dailyLimitCents',
      'documentMasked',
      'ownerName',
      'profileId',
    ]);
  });
  it.each([
    null,
    [],
    {},
    { displayName: '', transactionPassword: '123456' },
    { displayName: 'x'.repeat(81), transactionPassword: '123456' },
    { displayName: 'A', transactionPassword: 123456 },
    { displayName: 'A', transactionPassword: '12345' },
    { displayName: 'A', transactionPassword: '123456', extra: true },
  ])('valida antes de escrever', async (body) => {
    const register = vi.fn();
    const service = new LocalBankingService({
      register,
    } as unknown as DomainRepository);
    await expect(service.register(body)).rejects.toThrow(
      'INVALID_PROFILE_INPUT',
    );
    expect(register).not.toHaveBeenCalled();
  });
  it('preserva falhas inesperadas para filtro global', async () => {
    const service = new LocalBankingService({
      register: vi.fn().mockRejectedValue(new Error('internal')),
    } as unknown as DomainRepository);
    await expect(
      service.register({
        displayName: 'Exemplo',
        transactionPassword: '012345',
      }),
    ).rejects.toThrow('internal');
  });
});

it.each([
  'marina@example.test',
  'a.b@example.test',
  `${'a'.repeat(64)}@example.test`,
  `a@${'b'.repeat(63)}.test`,
])('aceita email nos limites permitidos', (key) => {
  expect(pixKey({ key })).toBe(key);
});

it.each([
  [413, 'entity.too.large', 'PAYLOAD_TOO_LARGE'],
  [415, 'charset.unsupported', 'UNSUPPORTED_MEDIA_TYPE'],
  [415, 'encoding.unsupported', 'UNSUPPORTED_MEDIA_TYPE'],
] as const)('padroniza falha de parser %s', (status, type, code) => {
  for (const error of [
    Object.assign(new Error('SECRET'), { status, type }),
    new HttpException('SECRET', status),
  ]) {
    const json = vi.fn();
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json,
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/profiles', method: 'POST' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    new ProblemFilter().catch(error, host);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ status, code }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('SECRET');
  }
});
