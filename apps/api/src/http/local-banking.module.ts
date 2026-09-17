import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { DatabaseModule } from '../database/database.module';
import { LocalBankingService } from './local-banking.service';
import { localProfileId } from './local-profile.context';
import { workspaceIdFromRequest } from '../workspace/workspace-context';
@Controller('api/v1')
export class LocalBankingController {
  constructor(
    @Inject(LocalBankingService) private readonly service: LocalBankingService,
  ) {}
  @Post('profiles') register(
    @Req() request: IncomingMessage,
    @Body() body: unknown,
  ) {
    return this.service.register(body, workspaceIdFromRequest(request));
  }
  @Get('profiles') profiles(@Req() request: IncomingMessage) {
    return this.service.profiles(workspaceIdFromRequest(request));
  }
  @Get('accounts/me') account(@Req() request: IncomingMessage) {
    return this.service.account(
      localProfileId(request.rawHeaders),
      workspaceIdFromRequest(request),
    );
  }
  @Get('recipients/resolve') resolve(
    @Req() request: IncomingMessage,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.resolve(query, workspaceIdFromRequest(request));
  }
  @Get('recipients/frequent') frequent(@Req() request: IncomingMessage) {
    return this.service.frequent(workspaceIdFromRequest(request));
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [LocalBankingController],
  providers: [LocalBankingService],
})
export class LocalBankingModule {}
