import { Body, Controller, Inject, Module, Post, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { DatabaseModule } from '../database/database.module';
import { SessionService } from './session.service';
import { WorkspaceRepository } from './workspace.repository';

@Controller('api/v1/sessions')
export class SessionController {
  constructor(
    @Inject(SessionService) private readonly service: SessionService,
  ) {}

  /**
   * Autentica `/join/:groupSlug` (DEV-004): grava o cookie de sessão e
   * devolve só o rótulo do grupo — nunca o código nem o `workspaceId` cru,
   * para a UI remover o código da URL sem reexpô-lo.
   */
  @Post('join') async join(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const { groupSlug, cookie } = await this.service.join(body);
    response.setHeader('Set-Cookie', cookie);
    return { groupSlug };
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [SessionController],
  providers: [SessionService, WorkspaceRepository],
  exports: [WorkspaceRepository],
})
export class SessionModule {}
