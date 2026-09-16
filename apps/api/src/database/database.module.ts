import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { parseFixedClock } from './clock.config';
import {
  DomainRepository,
  defaultRuntime,
  PERSISTENCE_RUNTIME,
  type PersistenceRuntime,
} from '../repositories/domain.repository';
@Module({
  providers: [
    PrismaService,
    DomainRepository,
    {
      provide: PERSISTENCE_RUNTIME,
      useFactory: (): PersistenceRuntime => {
        const fixedClock = parseFixedClock();
        return fixedClock
          ? { ...defaultRuntime, now: () => fixedClock }
          : defaultRuntime;
      },
    },
  ],
  exports: [PrismaService, DomainRepository, PERSISTENCE_RUNTIME],
})
export class DatabaseModule {}
