import 'reflect-metadata';
import { PrismaService } from './prisma.service';
import { initialize, reset, seed } from './seed';
async function main(): Promise<void> {
  const db = new PrismaService();
  try {
    switch (process.argv[2]) {
      case 'initialize':
        await initialize(db);
        break;
      case 'seed':
        await seed(db);
        break;
      case 'reset':
        await reset(db, process.env);
        break;
      default:
        throw new Error('Comando inválido.');
    }
    console.log('Persistência local preparada.');
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Falha ao preparar persistência local; verifique o banco e a autorização do comando.',
  );
  process.exitCode = 1;
});
