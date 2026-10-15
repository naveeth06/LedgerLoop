import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenClaims } from './access-token.service';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenClaims;
  companyMembership?: {
    id: string;
    company_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer';
  };
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
