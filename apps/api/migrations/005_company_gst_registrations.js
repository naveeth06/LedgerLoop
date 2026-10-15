exports.up = (pgm) => {
  pgm.createTable('gst_registrations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    gstin: { type: 'varchar(15)', notNull: true },
    legal_name: { type: 'text', notNull: true },
    trade_name: { type: 'text' },
    state_code: { type: 'varchar(2)', notNull: true },
    registration_type: { type: 'text', notNull: true, default: 'regular' },
    is_primary: { type: 'boolean', notNull: true, default: false },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('gst_registrations', 'gst_registrations_gstin_format_check', {
    check: "gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'",
  });
  pgm.addConstraint('gst_registrations', 'gst_registrations_state_code_matches_gstin', {
    check: 'state_code = substring(gstin from 1 for 2)',
  });
  pgm.addConstraint('gst_registrations', 'gst_registrations_type_check', {
    check: "registration_type IN ('regular', 'composition', 'casual', 'sez', 'non_resident')",
  });
  pgm.addConstraint('gst_registrations', 'gst_registrations_company_gstin_unique', {
    unique: ['company_id', 'gstin'],
  });
  pgm.createIndex('gst_registrations', ['company_id']);
  pgm.sql("CREATE UNIQUE INDEX gst_registrations_one_primary_per_company ON gst_registrations(company_id) WHERE is_primary AND is_active");
  pgm.sql('ALTER TABLE gst_registrations ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE gst_registrations FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY gst_registrations_tenant_isolation ON gst_registrations USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON gst_registrations TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('gst_registrations');
};
