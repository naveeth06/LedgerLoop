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
import { JournalReversalsController } from './companies/journal-reversals.controller';
import { OpeningBalancesController } from './companies/opening-balances.controller';
import { PartiesController } from './companies/parties.controller';
import { SalesDocumentsController } from './companies/sales-documents.controller';
import { SalesInvoicePostingV2Controller } from './companies/sales-invoice-posting-v2.controller';
import { SalesReceiptsController } from './companies/sales-receipts.controller';
import { PurchaseDocumentsController } from './companies/purchase-documents.controller';
import { PurchaseBillPostingV2Controller } from './companies/purchase-bill-posting-v2.controller';
import { SupplierPaymentsController } from './companies/supplier-payments.controller';
import { InventoryController } from './companies/inventory.controller';
import { InventoryValuationController } from './companies/inventory-valuation.controller';
import { InventoryValuationService } from './companies/inventory-valuation.service';
import { BankAccountsController } from './companies/bank-accounts.controller';
import { BankStatementImportsController } from './companies/bank-statement-imports.controller';
import { BankReconciliationController } from './companies/bank-reconciliation.controller';
import { ReportsController } from './companies/reports.controller';
import { FinancialReportsController } from './companies/financial-reports.controller';
import { ReceivablesGstReportsController } from './companies/receivables-gst-reports.controller';
import { ExpensesDebitNotesController } from './companies/expenses-debit-notes.controller';
import { SalesGstService } from './companies/sales-gst.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    AppController, CompaniesController, AccountsController, CompanySettingsController,
    PartiesController, ItemsController, WarehousesController, JournalEntriesController,
    JournalReversalsController, OpeningBalancesController, SalesDocumentsController, SalesInvoicePostingV2Controller,
    SalesReceiptsController, PurchaseDocumentsController, PurchaseBillPostingV2Controller,
    SupplierPaymentsController, InventoryController, InventoryValuationController, BankAccountsController,
    BankStatementImportsController, BankReconciliationController, ReportsController,
    FinancialReportsController, ReceivablesGstReportsController, ExpensesDebitNotesController,
  ],
  providers: [
    SalesGstService,
    InventoryValuationService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: CompanyRoleGuard },
  ],
})
export class AppModule {}
