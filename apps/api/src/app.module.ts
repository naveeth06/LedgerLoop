import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AccessTokenGuard } from './auth/access-token.guard';
import { CompanyRoleGuard } from './auth/company-role.guard';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AccountsController } from './companies/accounts.controller';
import { CompaniesController } from './companies/companies.controller';
import { CompanySettingsController } from './companies/company-settings.controller';
import { ItemsController, WarehousesController } from './companies/items-warehouses.controller';
import { JournalEntriesController } from './companies/journal-entries.controller';
import { OpeningBalancesController } from './companies/opening-balances.controller';
import { PartiesController } from './companies/parties.controller';
import { SalesDocumentsController } from './companies/sales-documents.controller';
import { SalesInvoicePostingController } from './companies/sales-invoice-posting.controller';
import { SalesReceiptsController } from './companies/sales-receipts.controller';
import { PurchaseDocumentsController } from './companies/purchase-documents.controller';
import { SalesGstService } from './companies/sales-gst.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    AppController,
    CompaniesController,
    AccountsController,
    CompanySettingsController,
    PartiesController,
    ItemsController,
    WarehousesController,
    JournalEntriesController,
    OpeningBalancesController,
    SalesDocumentsController,
    SalesInvoicePostingController,
    SalesReceiptsController,
    PurchaseDocumentsController,
  ],
  providers: [
    SalesGstService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: CompanyRoleGuard },
  ],
})
export class AppModule {}
