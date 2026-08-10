import { Controller, Get } from '@nestjs/common';

import { Public } from './auth/decorators/public.decorator';

@Controller()
export class HealthController {
  /** Unauthenticated liveness probe for the platform's health check. */
  @Public()
  @Get('health')
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
