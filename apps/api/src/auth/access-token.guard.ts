import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenService } from './access-token.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedRequest } from './current-user';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('A valid bearer access token is required.');
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw new UnauthorizedException('A valid bearer access token is required.');

    const claims = this.accessTokens.verify(match[1]);
    if (!claims) throw new UnauthorizedException('Access token is invalid or expired.');
    request.user = claims;
    return true;
  }
}
