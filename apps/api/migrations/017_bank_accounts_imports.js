exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE bank_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      ledger_account_id uuid NOT NULL,
      account_name varchar(160) NOT NULL,
      bank_name varchar(160) NOT NULL,
      account_number_last4 varchar(4),
      currency varchar(3) NOT NULL DEFAULT 'INR',
      is_active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, id),
      UNIQUE(company_id, ledger_account_id),
      FOREIGN KEY(company_id, ledger_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      CHECK (account_number_last4 IS NULL OR account_number_last4 ~ '^[0-9]{4}$'),
      CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$')
    );
    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
    CREATE POLICY bank_accounts_tenant_isolation ON bank_accounts
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON bank_accounts TO ledgerloop_app;

    CREATE TABLE bank_statement_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      bank_account_id uuid NOT NULL,
      source_name varchar(200),
      imported_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, bank_account_id) REFERENCES bank_accounts(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_statement_imports FORCE ROW LEVEL SECURITY;
    CREATE POLICY bank_statement_imports_tenant_isolation ON bank_statement_imports
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON bank_statement_imports TO ledgerloop_app;

    CREATE TABLE bank_statement_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      bank_account_id uuid NOT NULL,
      import_id uuid,
      transaction_date date NOT NULL,
      value_date date,
      transaction_type text NOT NULL CHECK (transaction_type IN ('debit','credit')),
      amount_paise bigint NOT NULL CHECK (amount_paise > 0),
      description text NOT NULL,
      reference varchar(200),
      external_id varchar(200),
      balance_after_paise bigint,
      status text NOT NULL DEFAULT 'unreconciled' CHECK (status IN ('unreconciled','matched','reconciled')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, bank_account_id) REFERENCES bank_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, import_id) REFERENCES bank_statement_imports(company_id, id) ON DELETE SET NULL
    );
    ALTER TABLE bank_statement_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_statement_transactions FORCE ROW LEVEL SECURITY;
    CREATE POLICY bank_statement_transactions_tenant_isolation ON bank_statement_transactions
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON bank_statement_transactions TO ledgerloop_app;

    CREATE UNIQUE INDEX bank_statement_transactions_external_id_uq
      ON bank_statement_transactions(company_id, bank_account_id, external_id)
      WHERE external_id IS NOT NULL;
    CREATE INDEX bank_statement_transactions_account_date_idx
      ON bank_statement_transactions(company_id, bank_account_id, transaction_date, created_at);
    CREATE INDEX bank_statement_transactions_status_idx
      ON bank_statement_transactions(company_id, bank_account_id, status);
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS bank_statement_transactions');
  pgm.sql('DROP TABLE IF EXISTS bank_statement_imports');
  pgm.sql('DROP TABLE IF EXISTS bank_accounts');
};
