exports.up = (pgm) => {
  pgm.createTable('company_parties', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    party_code: { type: 'varchar(32)', notNull: true },
    name: { type: 'text', notNull: true },
    party_type: { type: 'text', notNull: true },
    gstin: { type: 'varchar(15)' },
    email: { type: 'text' },
    phone: { type: 'varchar(32)' },
    billing_address: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    credit_limit_paise: { type: 'bigint', notNull: true, default: 0 },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('company_parties', 'company_parties_type_check', {
    check: "party_type IN ('customer', 'supplier', 'both')",
  });
  pgm.addConstraint('company_parties', 'company_parties_credit_limit_nonnegative', {
    check: 'credit_limit_paise >= 0',
  });
  pgm.addConstraint('company_parties', 'company_parties_gstin_format_check', {
    check: "gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'",
  });
  pgm.addConstraint('company_parties', 'company_parties_company_code_unique', {
    unique: ['company_id', 'party_code'],
  });
  pgm.createIndex('company_parties', ['company_id', 'party_type', 'is_active']);
  pgm.createIndex('company_parties', ['company_id', 'name']);
  pgm.sql('ALTER TABLE company_parties ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE company_parties FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY company_parties_tenant_isolation ON company_parties USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON company_parties TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('company_parties');
};
