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
@Controller('api/v1')
export class LocalBankingController {
  constructor(
    @Inject(LocalBankingService) private readonly service: LocalBankingService,
  ) {}
  @Post('profiles') register(@Body() body: unknown) {
    return this.service.register(body);
  }
  @Get('profiles') profiles() {
    return this.service.profiles();
  }
  @Get('accounts/me') account(@Req() request: IncomingMessage) {
    return this.service.account(localProfileId(request.rawHeaders));
  }
  @Get('recipients/resolve') resolve(@Query() query: Record<string, unknown>) {
    return this.service.resolve(query);
  }
  @Get('recipients/frequent') frequent() {
    return this.service.frequent();
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [LocalBankingController],
  providers: [LocalBankingService],
})
export class LocalBankingModule {}
