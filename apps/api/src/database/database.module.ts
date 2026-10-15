import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService } from './audit.service';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';
import { TenantAccessService } from './tenant-access.service';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): Pool => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is required to start the API.');
        }
        return new Pool({
          connectionString,
          max: 10,
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          application_name: 'ledgerloop-api',
        });
      },
    },
    DatabaseService,
    TenantAccessService,
    AuditService,
  ],
  exports: [DATABASE_POOL, DatabaseService, TenantAccessService, AuditService],
})
export class DatabaseModule {}
