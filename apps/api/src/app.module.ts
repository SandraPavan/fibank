import { TransactionModule } from './transactions/transaction.module';
import { PixIntentModule } from './pix/pix-intent.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { LocalBankingModule } from './http/local-banking.module';
import { SimulationModule } from './simulation/simulation.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DatabaseModule,
    LocalBankingModule,
    PixIntentModule,
    TransactionModule,
    SimulationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
