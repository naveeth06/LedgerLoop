import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'api';
}

@Controller('health')
export class AppController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }
}
