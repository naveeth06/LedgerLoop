exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE purchase_posting_accounts (
      company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      payable_account_id uuid NOT NULL,
      purchase_account_id uuid NOT NULL,
      input_cgst_account_id uuid NOT NULL,
      input_sgst_account_id uuid NOT NULL,
      input_igst_account_id uuid NOT NULL,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(company_id, payable_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, purchase_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, input_cgst_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, input_sgst_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, input_igst_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      CHECK(payable_account_id <> purchase_account_id),
      CHECK(input_cgst_account_id <> input_sgst_account_id),
      CHECK(input_cgst_account_id <> input_igst_account_id),
      CHECK(input_sgst_account_id <> input_igst_account_id)
    );
    ALTER TABLE purchase_posting_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE purchase_posting_accounts FORCE ROW LEVEL SECURITY;
    CREATE POLICY purchase_posting_accounts_tenant_isolation ON purchase_posting_accounts
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON purchase_posting_accounts TO ledgerloop_app;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS purchase_posting_accounts');
};
