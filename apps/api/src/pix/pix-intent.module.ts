import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseModule } from '../database/database.module';
import { SimulationModule } from '../simulation/simulation.module';
import { localProfileId } from '../http/local-profile.context';
import { workspaceIdFromRequest } from '../workspace/workspace-context';
import { PixConfirmationService } from './pix-confirmation.service';
import {
  PIX_RISK_CONFIG,
  parsePixRiskConfig,
  type PixRiskConfig,
} from './pix-risk.config';
import {
  PIX_RISK_HISTORY,
  PixRiskEvaluator,
  transactionRiskHistory,
  type PixRiskHistoryPort,
} from './pix-risk.domain';
import { PixIntentService } from './pix-intent.service';
@Controller('api/v1/pix/intents')
export class PixIntentController {
  constructor(
    @Inject(PixIntentService) private readonly service: PixIntentService,
    @Inject(PixConfirmationService)
    private readonly confirmation: PixConfirmationService,
  ) {}
  @Post(':requestId/confirm')
  async confirm(
    @Req() request: IncomingMessage,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const result = await this.confirmation.confirm(
      localProfileId(request.rawHeaders),
      requestId,
      body,
      workspaceIdFromRequest(request),
    );
    response.statusCode = result.status === 'REVIEW' ? 202 : 200;
    return result;
  }
  @Post() create(@Req() request: IncomingMessage, @Body() body: unknown) {
    return this.service.create(
      localProfileId(request.rawHeaders),
      body,
      workspaceIdFromRequest(request),
    );
  }
  @Get(':requestId') get(
    @Req() request: IncomingMessage,
    @Param('requestId') requestId: string,
  ) {
    return this.service.get(
      localProfileId(request.rawHeaders),
      requestId,
      workspaceIdFromRequest(request),
    );
  }
  @Patch(':requestId') update(
    @Req() request: IncomingMessage,
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(
      localProfileId(request.rawHeaders),
      requestId,
      body,
      workspaceIdFromRequest(request),
    );
  }
}
@Module({
  imports: [DatabaseModule, SimulationModule],
  controllers: [PixIntentController],
  providers: [
    PixIntentService,
    PixConfirmationService,
    { provide: PIX_RISK_CONFIG, useFactory: () => parsePixRiskConfig() },
    { provide: PIX_RISK_HISTORY, useValue: transactionRiskHistory },
    {
      provide: PixRiskEvaluator,
      inject: [PIX_RISK_CONFIG, PIX_RISK_HISTORY],
      useFactory: (config: PixRiskConfig, history: PixRiskHistoryPort) =>
        new PixRiskEvaluator(config, history),
    },
  ],
})
export class PixIntentModule {}
