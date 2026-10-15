import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';

const auditEventSchema = z.object({
  actorUserId: z.string().uuid().nullable().optional(),
  action: z.string().trim().min(1).max(120),
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().uuid().nullable().optional(),
  requestId: z.string().trim().min(1).max(128).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEvent = z.input<typeof auditEventSchema>;

@Injectable()
export class AuditService {
  /**
   * Write the event on the same transaction/client as the mutation.
   * Company scope comes from transaction-local tenant context, not caller input.
   */
  async record(client: PoolClient, input: AuditEvent): Promise<void> {
    const event = auditEventSchema.parse(input);
    await client.query(
      'INSERT INTO audit_log ' +
        '(company_id, actor_user_id, action, entity_type, entity_id, request_id, metadata) ' +
        "VALUES (NULLIF(current_setting('app.current_company_id', true), '')::uuid, $1, $2, $3, $4, $5, $6::jsonb)",
      [
        event.actorUserId ?? null,
        event.action,
        event.entityType,
        event.entityId ?? null,
        event.requestId ?? null,
        JSON.stringify(event.metadata),
      ],
    );
  }
}
