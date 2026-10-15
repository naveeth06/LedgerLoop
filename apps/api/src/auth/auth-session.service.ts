import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { createRefreshToken, hashRefreshToken } from './refresh-token';

const uuidSchema = z.string().uuid();
const metadataSchema = z.object({
  userAgent: z.string().max(512).optional(),
  ipAddress: z.string().max(64).optional(),
}).optional();

export interface IssuedRefreshSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
}

export type RotatedRefreshSession = IssuedRefreshSession | { invalid: true };

@Injectable()
export class AuthSessionService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    userId: string,
    metadata?: { userAgent?: string; ipAddress?: string },
    transactionClient?: PoolClient,
  ): Promise<IssuedRefreshSession> {
    const parsedUserId = uuidSchema.parse(userId);
    const safeMetadata = metadataSchema.parse(metadata);
    const refreshToken = createRefreshToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const queryable = transactionClient ?? this.database.pool;

    await queryable.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, parsedUserId, hashRefreshToken(refreshToken), expiresAt, safeMetadata?.userAgent ?? null, safeMetadata?.ipAddress ?? null],
    );
    return { sessionId, userId: parsedUserId, refreshToken, expiresAt };
  }

  async revoke(refreshToken: string): Promise<void> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 128) return;
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const lookup = await client.query<{ id: string; family_id: string; revoked_at: Date | string | null }>(
        'SELECT id, family_id, revoked_at FROM auth_sessions WHERE token_hash = $1 FOR UPDATE',
        [hashRefreshToken(refreshToken)],
      );
      const current = lookup.rows[0];
      if (current?.revoked_at) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1',
          [current.family_id],
        );
      } else if (current) {
        await client.query('UPDATE auth_sessions SET revoked_at = now(), last_used_at = now() WHERE id = $1', [current.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rotate a refresh token exactly once. If a revoked token is replayed, revoke
   * every session in its family. Raw tokens are never stored in PostgreSQL.
   */
  async rotate(refreshToken: string): Promise<RotatedRefreshSession> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 128) {
      return { invalid: true };
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const lookup = await client.query<SessionRow>(
        `SELECT id, user_id, family_id, expires_at, revoked_at
           FROM auth_sessions WHERE token_hash = $1 FOR UPDATE`,
        [hashRefreshToken(refreshToken)],
      );
      const current = lookup.rows[0];
      if (!current) { await client.query('ROLLBACK'); return { invalid: true }; }

      if (current.revoked_at) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1',
          [current.family_id],
        );
        await client.query('COMMIT');
        return { invalid: true };
      }
      if (new Date(current.expires_at).getTime() <= Date.now()) {
        await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [current.id]);
        await client.query('COMMIT');
        return { invalid: true };
      }

      const nextToken = createRefreshToken();
      const nextId = randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO auth_sessions (id, user_id, family_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [nextId, current.user_id, current.family_id, hashRefreshToken(nextToken), expiresAt],
      );
      await client.query(
        'UPDATE auth_sessions SET revoked_at = now(), last_used_at = now(), replaced_by_session_id = $2 WHERE id = $1',
        [current.id, nextId],
      );
      await client.query('COMMIT');
      return { sessionId: nextId, userId: current.user_id, refreshToken: nextToken, expiresAt };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original error. */ }
      throw error;
    } finally {
      client.release();
    }
  }
}

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}
