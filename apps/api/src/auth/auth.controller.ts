import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PoolClient } from 'pg';
import type { Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AccessTokenService } from './access-token.service';
import { Public } from './public.decorator';
import type { AuthenticatedRequest } from './current-user';
import { AuthSessionService } from './auth-session.service';
import { PasswordService } from './password.service';

const signUpSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(120),
}).strict();

const signInSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();

const REFRESH_COOKIE = 'll_refresh';
const CSRF_COOKIE = 'll_csrf';
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signUp(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertTrustedOrigin(request);
    const input = parseBody(signUpSchema, request.body);
    const passwordHash = await this.passwords.hash(input.password);
    const client = await this.database.pool.connect();
    let session;
    let user: { id: string; email: string; display_name: string };
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string; email: string; display_name: string }>(
        `INSERT INTO app_users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name`,
        [input.email, passwordHash, input.displayName],
      );
      user = inserted.rows[0];
      session = await this.sessions.create(user.id, requestMetadata(request), client as PoolClient);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original error. */ }
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    } finally {
      client.release();
    }
    this.setSessionCookies(response, session.refreshToken);
    return { user: publicUser(user), ...this.accessTokens.issue(user.id) };
  }

  @Public()
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signIn(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertTrustedOrigin(request);
    const input = parseBody(signInSchema, request.body);
    const result = await this.database.pool.query<{ id: string; email: string; display_name: string | null; password_hash: string | null }>(
      'SELECT id, email, display_name, password_hash FROM app_users WHERE email = $1 LIMIT 1',
      [input.email],
    );
    const user = result.rows[0];
    const valid = user?.password_hash
      ? await this.passwords.verify(input.password, user.password_hash)
      : await this.passwords.verify(input.password, '$argon2id$invalid');
    if (!user || !valid || !user.password_hash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const session = await this.sessions.create(user.id, requestMetadata(request));
    this.setSessionCookies(response, session.refreshToken);
    return { user: publicUser(user), ...this.accessTokens.issue(user.id) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertTrustedOrigin(request);
    this.assertCsrf(request);
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) throw new UnauthorizedException('Session is invalid or expired.');
    const rotated = await this.sessions.rotate(refreshToken);
    if ('invalid' in rotated) {
      this.clearSessionCookies(response);
      throw new UnauthorizedException('Session is invalid or expired.');
    }
    this.setSessionCookies(response, rotated.refreshToken);
    return this.accessTokens.issue(rotated.userId);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    this.assertTrustedOrigin(request);
    this.assertCsrf(request);
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (refreshToken) await this.sessions.revoke(refreshToken);
    this.clearSessionCookies(response);
  }

  @Get('me')
  async getCurrentUser(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('A valid bearer access token is required.');
    const result = await this.database.pool.query<{ id: string; email: string; display_name: string | null }>(
      'SELECT id, email, display_name FROM app_users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Authenticated user no longer exists.');
    return { user: publicUser(user) };
  }

  private assertTrustedOrigin(request: Request): void {
    const expected = process.env.WEB_ORIGIN ?? 'http://localhost:4200';
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin !== expected) {
      throw new UnauthorizedException('Request origin is not allowed.');
    }
  }

  private assertCsrf(request: Request): void {
    const cookie = readCookie(request, CSRF_COOKIE);
    const header = request.headers['x-csrf-token'];
    if (!cookie || typeof header !== 'string') throw new BadRequestException('CSRF token is missing or invalid.');
    const left = Buffer.from(cookie, 'utf8');
    const right = Buffer.from(header, 'utf8');
    if (left.length !== right.length || !timingSafeEqual(left, right) || !isValidCsrfToken(cookie)) {
      throw new BadRequestException('CSRF token is missing or invalid.');
    }
  }

  private setSessionCookies(response: Response, refreshToken: string): void {
    const csrfToken = createCsrfToken();
    const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    response.setHeader('Set-Cookie', [
      cookie(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure, sameSite: 'Strict', maxAge: REFRESH_TTL_SECONDS, path: '/api/auth' }),
      cookie(CSRF_COOKIE, csrfToken, { httpOnly: false, secure, sameSite: 'Strict', maxAge: REFRESH_TTL_SECONDS, path: '/api/auth' }),
    ]);
  }

  private clearSessionCookies(response: Response): void {
    const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    response.setHeader('Set-Cookie', [
      cookie(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'Strict', maxAge: 0, path: '/api/auth' }),
      cookie(CSRF_COOKIE, '', { httpOnly: false, secure, sameSite: 'Strict', maxAge: 0, path: '/api/auth' }),
    ]);
  }
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException('Request body is invalid.');
  return result.data;
}

function requestMetadata(request: Request): { userAgent?: string } {
  const userAgent = request.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : undefined };
}

function publicUser(user: { id: string; email: string; display_name: string | null }) {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function cookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; secure: boolean; sameSite: 'Strict'; maxAge: number; path: string },
): string {
  const parts = [
    name + '=' + encodeURIComponent(value),
    'Path=' + options.path,
    'Max-Age=' + options.maxAge,
    'SameSite=' + options.sameSite,
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function createCsrfToken(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('CSRF_SECRET must contain at least 32 bytes.');
  }
  const nonce = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', secret).update(nonce).digest('base64url');
  return nonce + '.' + signature;
}

function isValidCsrfToken(token: string): boolean {
  const secret = process.env.CSRF_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(parts[0]).digest('base64url'), 'utf8');
  const actual = Buffer.from(parts[1], 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
