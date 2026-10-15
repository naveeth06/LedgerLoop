import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from './app.module';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL must use postgres:// or postgresql://',
  ),
  WEB_ORIGIN: z.string().url().default('http://localhost:4200'),
  AUTH_TOKEN_SECRET: z.string().min(32, 'AUTH_TOKEN_SECRET must contain at least 32 characters.'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must contain at least 32 characters.'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
});

async function bootstrap(): Promise<void> {
  const environment = environmentSchema.safeParse(process.env);
  if (!environment.success) {
    throw new Error(`Invalid API environment: ${environment.error.message}`);
  }

  const app = await NestFactory.create(AppModule);
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: environment.data.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });
  app.enableShutdownHooks();
  await app.listen(environment.data.API_PORT, '0.0.0.0');
}

void bootstrap();
