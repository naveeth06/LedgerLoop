exports.up = (pgm) => {
  pgm.createTable('sales_posting_accounts', {
    company_id: { type: 'uuid', primaryKey: true, references: 'companies', onDelete: 'cascade' },
    receivable_account_id: { type: 'uuid', notNull: true },
    sales_account_id: { type: 'uuid', notNull: true },
    output_cgst_account_id: { type: 'uuid', notNull: true },
    output_sgst_account_id: { type: 'uuid', notNull: true },
    output_igst_account_id: { type: 'uuid', notNull: true },
    created_by: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'restrict' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  for (const column of ['receivable_account_id', 'sales_account_id', 'output_cgst_account_id', 'output_sgst_account_id', 'output_igst_account_id']) {
    pgm.sql(`ALTER TABLE sales_posting_accounts ADD CONSTRAINT sales_posting_accounts_${column}_fk FOREIGN KEY (company_id, ${column}) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT`);
  }
  pgm.sql('ALTER TABLE sales_posting_accounts ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_posting_accounts FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_posting_accounts_tenant_isolation ON sales_posting_accounts USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON sales_posting_accounts TO ledgerloop_app');
  pgm.sql('REVOKE DELETE ON sales_posting_accounts FROM ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('sales_posting_accounts');
};
