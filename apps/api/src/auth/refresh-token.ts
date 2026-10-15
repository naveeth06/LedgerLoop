import { createHash, randomBytes } from 'node:crypto';

/** Return an opaque 256-bit refresh token. Persist only its SHA-256 digest. */
export function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
