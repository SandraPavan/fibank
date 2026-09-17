import { Controller, Get, Inject, Module, Param, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { DatabaseModule } from '../database/database.module';
import { localProfileId } from '../http/local-profile.context';
import { workspaceIdFromRequest } from '../workspace/workspace-context';
import { TransactionService } from './transaction.service';
@Controller('api/v1/transactions')
export class TransactionController {
  constructor(
    @Inject(TransactionService) private readonly service: TransactionService,
  ) {}
  @Get() list(@Req() request: IncomingMessage) {
    const query = new URLSearchParams(
      (request.url ?? '').split('?').slice(1).join('?'),
    );
    return this.service.list(
      localProfileId(request.rawHeaders),
      query.entries(),
      workspaceIdFromRequest(request),
    );
  }
  @Get(':transactionId') get(
    @Req() request: IncomingMessage,
    @Param('transactionId') transactionId: string,
  ) {
    return this.service.get(
      localProfileId(request.rawHeaders),
      transactionId,
      workspaceIdFromRequest(request),
    );
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [TransactionController],
  providers: [TransactionService],
})
export class TransactionModule {}
