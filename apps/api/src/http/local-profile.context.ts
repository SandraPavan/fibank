import { ApiProblem } from './problem';
export function localProfileId(rawHeaders: readonly string[]): string {
  const values: string[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'x-local-profile-id')
      values.push(rawHeaders[index + 1] ?? '');
  }
  if (values.length === 0) return 'PRO-1001';
  if (values.length !== 1 || !/^PRO-[A-Za-z0-9-]+$/.test(values[0]!))
    throw new ApiProblem('INVALID_LOCAL_PROFILE');
  return values[0]!;
}
export function pixKey(query: Record<string, unknown>): string {
  const key = query.key;
  if (
    typeof key !== 'string' ||
    key.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      key,
    )
  )
    throw new ApiProblem('INVALID_PIX_KEY');
  const [local, domain] = key.split('@');
  if (
    local!.length > 64 ||
    local!.startsWith('.') ||
    local!.endsWith('.') ||
    local!.includes('..') ||
    domain!.split('.').some((label) => label.length > 63)
  )
    throw new ApiProblem('INVALID_PIX_KEY');
  return key;
}
