import { expect, it } from 'vitest';
import {
  TransactionQueryError,
  validateTransactionQuery,
} from '../src/transactions/transaction-query.domain';
const query = (value: string) =>
  validateTransactionQuery(new URLSearchParams(value));
it('normaliza defaults, limites opcionais, busca literal e offset seguro', () => {
  expect(query('')).toEqual({ page: 1, pageSize: 20, offset: 0 });
  expect(query('from=&to=&status=&type=&search=')).toEqual(query(''));
  expect(query('page=2&pageSize=100&type=PIX&search=+.*[x]+')).toMatchObject({
    page: 2,
    pageSize: 100,
    offset: 100,
    search: '.*[x]',
  });
  expect(query('page=9007199254740991&pageSize=1').offset).toBe(
    9007199254740990,
  );
});
it.each([
  'page=',
  'pageSize=',
  'page=0',
  'page=-1',
  'page=1.2',
  'page=1e2',
  'page=%2B1',
  'page=+1',
  'pageSize=101',
  'pageSize=0',
  'page=9007199254740992',
  'page=9007199254740991&pageSize=2',
  'status=approved',
  'type=TED',
  'extra=1',
  'page=1&page=1',
  'status=&status=APPROVED',
  'page[]=1',
  'search[x]=x',
  'from=2026-02-29',
  'from=2026-13-01',
  'from=2026-00-01',
  'from=2026-01-00',
  'from=2026-1-01',
  'from=2026-08-18T00:00:00Z',
  'from=2026-08-19&to=2026-08-18',
  `search=${'a'.repeat(101)}`,
])('rejeita query ambígua ou inválida: %s', (value) => {
  expect(() => query(value)).toThrow(TransactionQueryError);
});
it('rejeita valores estruturados antes de normalizar', () => {
  for (const value of [[], {}, 1, null, undefined])
    expect(() => validateTransactionQuery([['search', value]])).toThrow(
      TransactionQueryError,
    );
});
it('converte dias inclusivos em São Paulo, ano bissexto e transições de verão', () => {
  expect(query('from=2026-08-18&to=2026-08-18')).toMatchObject({
    from: new Date('2026-08-18T03:00:00Z'),
    toExclusive: new Date('2026-08-19T03:00:00Z'),
  });
  expect(query('from=2024-02-29').from).toEqual(
    new Date('2024-02-29T03:00:00Z'),
  );
  expect(query('from=2018-11-04&to=2018-11-04')).toMatchObject({
    from: new Date('2018-11-04T03:00:00Z'),
    toExclusive: new Date('2018-11-05T02:00:00Z'),
  });
  expect(query('from=2019-02-16&to=2019-02-16')).toMatchObject({
    from: new Date('2019-02-16T02:00:00Z'),
    toExclusive: new Date('2019-02-17T03:00:00Z'),
  });
});
