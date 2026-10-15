exports.up = (pgm) => {
  pgm.createTable('ledger_accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    account_code: { type: 'varchar(32)', notNull: true },
    name: { type: 'varchar(160)', notNull: true },
    account_type: { type: 'text', notNull: true },
    parent_account_id: { type: 'uuid' },
    description: { type: 'text' },
    is_system: { type: 'boolean', notNull: true, default: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_by: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'restrict' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('ledger_accounts', 'ledger_accounts_type_check', {
    check: "account_type IN ('asset', 'liability', 'equity', 'income', 'expense')",
  });
  pgm.addConstraint('ledger_accounts', 'ledger_accounts_company_code_unique', {
    unique: ['company_id', 'account_code'],
  });
  pgm.addConstraint('ledger_accounts', 'ledger_accounts_company_id_id_unique', {
    unique: ['company_id', 'id'],
  });
  pgm.sql(
    'ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_parent_same_company_fk ' +
    'FOREIGN KEY (company_id, parent_account_id) REFERENCES ledger_accounts(company_id, id) ' +
    'ON DELETE RESTRICT'
  );
  pgm.addConstraint('ledger_accounts', 'ledger_accounts_not_self_parent_check', {
    check: 'parent_account_id IS NULL OR parent_account_id <> id',
  });

  pgm.createIndex('ledger_accounts', ['company_id', 'account_type', 'is_active']);
  pgm.sql('ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE ledger_accounts FORCE ROW LEVEL SECURITY');
  pgm.sql(
    "CREATE POLICY ledger_accounts_tenant_isolation ON ledger_accounts " +
    "USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) " +
    "WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)"
  );
  pgm.sql('GRANT SELECT, INSERT ON ledger_accounts TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON ledger_accounts FROM ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('ledger_accounts');
};
