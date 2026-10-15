exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('app_users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text' },
    google_subject: { type: 'text', unique: true },
    display_name: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('companies', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    legal_name: { type: 'text', notNull: true },
    display_name: { type: 'text', notNull: true },
    base_currency: { type: 'varchar(3)', notNull: true, default: 'INR' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('company_memberships', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    user_id: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'cascade' },
    role: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('company_memberships', 'company_memberships_role_check', {
    check: "role IN ('owner', 'admin', 'accountant', 'staff', 'viewer')",
  });
  pgm.addConstraint('company_memberships', 'company_memberships_status_check', {
    check: "status IN ('invited', 'active', 'suspended')",
  });
  pgm.addConstraint('company_memberships', 'company_memberships_company_user_unique', {
    unique: ['company_id', 'user_id'],
  });

  pgm.createTable('branches', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    code: { type: 'text', notNull: true },
    gstin: { type: 'varchar(15)' },
    address: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('branches', 'branches_company_code_unique', {
    unique: ['company_id', 'code'],
  });

  pgm.createTable('audit_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'restrict' },
    actor_user_id: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    action: { type: 'text', notNull: true },
    entity_type: { type: 'text', notNull: true },
    entity_id: { type: 'uuid' },
    request_id: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('branches', ['company_id']);
  pgm.createIndex('audit_log', ['company_id', 'created_at']);
  pgm.createIndex('audit_log', ['company_id', 'entity_type', 'entity_id']);

  for (const table of ['companies', 'company_memberships', 'branches', 'audit_log']) {
    pgm.sql('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY');
    pgm.sql('ALTER TABLE ' + table + ' FORCE ROW LEVEL SECURITY');
  }

  pgm.sql("CREATE POLICY companies_tenant_isolation ON companies USING (id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  for (const table of ['company_memberships', 'branches', 'audit_log']) {
    pgm.sql("CREATE POLICY " + table + "_tenant_isolation ON " + table + " USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  }

  pgm.sql('GRANT SELECT, INSERT, UPDATE, DELETE ON companies, company_memberships, branches TO ledgerloop_app');
  pgm.sql('GRANT SELECT, INSERT ON audit_log TO ledgerloop_app');
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON app_users TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('audit_log');
  pgm.dropTable('branches');
  pgm.dropTable('company_memberships');
  pgm.dropTable('companies');
  pgm.dropTable('app_users');
};
