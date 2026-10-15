import { describe, expect, it } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { DatabaseService } from '../database/database.service';
import type { AccessTokenService } from './access-token.service';
import type { AuthSessionService } from './auth-session.service';
import type { PasswordService } from './password.service';

function controller(): AuthController {
  return new AuthController(
    {} as DatabaseService,
    {} as PasswordService,
    {} as AuthSessionService,
    {} as AccessTokenService,
  );
}

function request(headers: Record<string, string | undefined>, body: unknown = {}): Request {
  return { headers, body } as unknown as Request;
}

const response = { setHeader: () => undefined } as unknown as Response;

describe('AuthController request protections', () => {
  it('rejects auth mutations from an untrusted origin', async () => {
    await expect(controller().signUp(request({ origin: 'https://attacker.example' }), response))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires a CSRF cookie and matching header for refresh', async () => {
    await expect(controller().refresh(request({ origin: 'http://localhost:4200' }), response))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unexpected sign-in fields before accessing the database', async () => {
    await expect(controller().signIn(
      request({ origin: 'http://localhost:4200' }, { email: 'user@example.com', password: 'long-enough-password', admin: true }),
      response,
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
