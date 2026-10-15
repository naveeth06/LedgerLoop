import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { CompanyMembership } from './tenant-transaction';
import { withAuthorizedTenantTransaction } from './tenant-transaction';
import { DatabaseService } from './database.service';

@Injectable()
export class TenantAccessService {
  constructor(private readonly database: DatabaseService) {}

  withCompanyTransaction<T>(
    authenticatedUserId: string,
    requestedCompanyId: string,
    work: (client: PoolClient, membership: CompanyMembership) => Promise<T>,
  ): Promise<T> {
    return withAuthorizedTenantTransaction(
      this.database.pool as Pool,
      authenticatedUserId,
      requestedCompanyId,
      work,
    );
  }
}
