import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class HealthController {
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
