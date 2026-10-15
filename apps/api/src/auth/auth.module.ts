import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { PasswordService } from './password.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [AuthController],
  providers: [
    AuthSessionService,
    PasswordService,
    AccessTokenService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthSessionService, PasswordService, AccessTokenService],
})
export class AuthModule {}
