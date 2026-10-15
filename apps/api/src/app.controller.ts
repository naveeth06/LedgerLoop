import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

export interface HealthResponse {
  status: 'ok';
  service: 'api';
}

@Controller('health')
export class AppController {
  @Public()
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }
}
