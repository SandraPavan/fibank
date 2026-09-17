import { TransactionModule } from './transactions/transaction.module';
import { PixIntentModule } from './pix/pix-intent.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { LocalBankingModule } from './http/local-banking.module';
import { SimulationModule } from './simulation/simulation.module';
import { SessionModule } from './workspace/session.module';
import { FacilitatorModule } from './workspace/facilitator.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    DatabaseModule,
    LocalBankingModule,
    PixIntentModule,
    TransactionModule,
    SimulationModule,
    SessionModule,
    FacilitatorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
