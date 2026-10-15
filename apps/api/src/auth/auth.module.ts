import { Module } from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';
import { PasswordService } from './password.service';

@Module({
  providers: [AuthSessionService, PasswordService],
  exports: [AuthSessionService, PasswordService],
})
export class AuthModule {}
