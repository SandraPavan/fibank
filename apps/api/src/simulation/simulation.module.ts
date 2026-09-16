import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Module,
  OnModuleInit,
  Param,
  Post,
} from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SIMULATION_LATENCY } from '../repositories/domain.repository';
import {
  assertSimulationStartupAllowed,
  parseSimulationConfig,
} from './simulation.config';
import { SimulationLatencyService } from './simulation-latency.service';
import { SimulationService } from './simulation.service';

@Controller('api/v1/simulation')
export class SimulationController {
  constructor(
    @Inject(SimulationService) private readonly service: SimulationService,
  ) {}

  // Não "cria" nada — restaura estado; 200 é mais correto que o 201
  // padrão do Nest para POST.
  @Post('reset') @HttpCode(200) reset() {
    return this.service.reset();
  }

  @Post('scenarios/:scenarioId/apply') applyScenario(
    @Param('scenarioId') scenarioId: string,
    @Body() body: unknown,
  ) {
    return this.service.applyScenario(scenarioId, body);
  }
}

/**
 * Disponível apenas fora de produção (dev/02-arquitetura.md).
 * `onModuleInit` falha a inicialização somente quando `NODE_ENV=production`
 * sem `WORKSHOP_MODE=true` explícito — o resto da API continua subindo
 * normalmente em desenvolvimento/teste sem essa variável; cada endpoint
 * deste módulo recusa a operação por conta própria nesse caso
 * (`assertSimulationEnabled`), sem derrubar o processo.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SimulationLatencyService,
    { provide: SIMULATION_LATENCY, useExisting: SimulationLatencyService },
  ],
  exports: [SIMULATION_LATENCY, SimulationLatencyService],
})
export class SimulationModule implements OnModuleInit {
  onModuleInit(): void {
    assertSimulationStartupAllowed(parseSimulationConfig());
  }
}
