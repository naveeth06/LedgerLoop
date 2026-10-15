import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const claimsSchema = z.object({
  sub: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  iss: z.literal('ledgerloop-api'),
  aud: z.literal('ledgerloop-web'),
});

export interface AccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  iss: 'ledgerloop-api';
  aud: 'ledgerloop-web';
}

@Injectable()
export class AccessTokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor() {
    const secret = process.env.AUTH_TOKEN_SECRET;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('AUTH_TOKEN_SECRET must contain at least 32 bytes.');
    }
    this.secret = secret;
    const configuredTtl = Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 900);
    if (!Number.isInteger(configuredTtl) || configuredTtl < 60 || configuredTtl > 3600) {
      throw new Error('AUTH_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 3600.');
    }
    this.ttlSeconds = configuredTtl;
  }

  issue(userId: string): { accessToken: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      sub: z.string().uuid().parse(userId),
      iat: now,
      exp: now + this.ttlSeconds,
      iss: 'ledgerloop-api',
      aud: 'ledgerloop-web',
    };
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode(claims);
    const input = header + '.' + payload;
    return { accessToken: input + '.' + this.sign(input), expiresIn: this.ttlSeconds };
  }

  verify(token: string): AccessTokenClaims | null {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signature] = parts;
    try {
      const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
      const expected = Buffer.from(this.sign(headerPart + '.' + payloadPart), 'base64url');
      const actual = Buffer.from(signature, 'base64url');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')));
      if (!parsed.success || parsed.data.exp <= Math.floor(Date.now() / 1000)) return null;
      if (parsed.data.iat > Math.floor(Date.now() / 1000) + 60) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private sign(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('base64url');
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
