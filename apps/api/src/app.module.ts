import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AccessTokenGuard } from './auth/access-token.guard';
import { CompanyRoleGuard } from './auth/company-role.guard';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { CompaniesController } from './companies/companies.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AppController, CompaniesController],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: CompanyRoleGuard },
  ],
})
export class AppModule {}
