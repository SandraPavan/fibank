import { execFileSync } from 'node:child_process';

/**
 * `finbank_test` nunca recebe `prisma db push` em nenhum outro caminho do
 * repositório: o `command` do serviço `api` em `compose.yaml` só roda
 * `db:push` contra `DATABASE_URL=.../finbank`, nunca `finbank_test`. Sem
 * isso, os índices únicos declarados no schema (`Account.accountId`,
 * `Account.profileId`, `Transaction.transactionId`) nunca existem de
 * verdade no banco de teste — as coleções nascem só de escritas ad-hoc do
 * Prisma Client, que criam a coleção, mas não os índices do schema.
 *
 * Roda uma vez por execução da suíte de integração, antes de qualquer
 * teste. `db push` é seguro de repetir (sincroniza o schema, não recria
 * dados).
 */
export default function setup(): void {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.pathname !== '/finbank_test') {
    throw new Error('Integração exige finbank_test.');
  }
  execFileSync(
    'npx',
    [
      'prisma',
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--skip-generate',
      '--accept-data-loss',
    ],
    { stdio: 'inherit' },
  );
}
