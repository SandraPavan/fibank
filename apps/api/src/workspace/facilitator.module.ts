import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import {
  PIX_REVIEW_SLA_CONFIG,
  parsePixReviewSlaConfig,
} from '../transactions/pix-review-sla.config';
import { SessionModule } from './session.module';
import { FacilitatorGuard } from './facilitator.guard';
import { FacilitatorService } from './facilitator.service';

@Controller('api/v1/facilitator/workspaces')
@UseGuards(FacilitatorGuard)
export class FacilitatorController {
  constructor(
    @Inject(FacilitatorService) private readonly service: FacilitatorService,
  ) {}

  @Post() create(@Body() body: unknown) {
    return this.service.createWorkspace(body);
  }

  @Get() list() {
    return this.service.listWorkspaces();
  }

  @Post('reset-all') @HttpCode(200) resetAll() {
    return this.service.resetAll();
  }

  @Post(':groupSlug/reset') @HttpCode(200) reset(
    @Param('groupSlug') groupSlug: string,
  ) {
    return this.service.resetWorkspace(groupSlug);
  }

  @Get(':groupSlug/metrics') metrics(@Param('groupSlug') groupSlug: string) {
    return this.service.metrics(groupSlug);
  }
}
@Module({
  imports: [DatabaseModule, SessionModule],
  controllers: [FacilitatorController],
  providers: [
    FacilitatorService,
    FacilitatorGuard,
    {
      provide: PIX_REVIEW_SLA_CONFIG,
      useFactory: () => parsePixReviewSlaConfig(),
    },
  ],
})
export class FacilitatorModule {}
