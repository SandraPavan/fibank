export class TransactionQueryError extends Error {}
export interface TransactionQuery {
  page: number;
  pageSize: number;
  offset: number;
  from?: Date;
  toExclusive?: Date;
  status?: 'APPROVED' | 'REVIEW' | 'REJECTED' | 'FAILED';
  search?: string;
}
function invalid(): never {
  throw new TransactionQueryError('INVALID_TRANSACTION_QUERY');
}
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  era: 'short',
});
function localDay(time: number): number {
  const parts = Object.fromEntries(
    formatter.formatToParts(time).map((p) => [p.type, p.value]),
  );
  const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
  return year * 10000 + Number(parts.month) * 100 + Number(parts.day);
}
function calendar(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid();
  return date;
}
// First instant of the civil day, including days whose midnight is skipped by DST.
function dayStart(date: Date): Date {
  const target =
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate();
  let low = date.getTime() - 2 * 86400000;
  let high = date.getTime() + 2 * 86400000;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDay(middle) < target) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
export function validateTransactionQuery(
  entries: Iterable<readonly [string, unknown]>,
): TransactionQuery {
  const values: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const allowed = [
    'page',
    'pageSize',
    'from',
    'to',
    'status',
    'type',
    'search',
  ];
  for (const [key, value] of entries) {
    if (
      !allowed.includes(key) ||
      Object.hasOwn(values, key) ||
      typeof value !== 'string'
    )
      invalid();
    values[key] = value;
  }
  function integer(key: string, fallback: number, max: number): number {
    const value = values[key];
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) invalid();
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || number > max) invalid();
    return number;
  }
  const page = integer('page', 1, Number.MAX_SAFE_INTEGER);
  const pageSize = integer('pageSize', 20, 100);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) invalid();
  const result: TransactionQuery = { page, pageSize, offset };
  if (values.from) result.from = dayStart(calendar(values.from));
  if (values.to) {
    const to = calendar(values.to);
    to.setUTCDate(to.getUTCDate() + 1);
    result.toExclusive = dayStart(to);
  }
  if (values.from && values.to && values.from > values.to) invalid();
  if (values.status) {
    if (!['APPROVED', 'REVIEW', 'REJECTED', 'FAILED'].includes(values.status))
      invalid();
    result.status = values.status as TransactionQuery['status'];
  }
  if (values.type && values.type !== 'PIX') invalid();
  const search = values.search?.trim();
  if (search && search.length > 100) invalid();
  if (search) result.search = search;
  return result;
}
