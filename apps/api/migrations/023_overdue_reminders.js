exports.up = (pgm) => {
  pgm.createTable('company_reminder_settings', {
    company_id: { type: 'uuid', primaryKey: true, references: 'companies', onDelete: 'cascade' },
    enabled: { type: 'boolean', notNull: true, default: false },
    first_after_days: { type: 'integer', notNull: true, default: 1 },
    repeat_every_days: { type: 'integer', notNull: true, default: 7 },
    max_reminders: { type: 'integer', notNull: true, default: 3 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('company_reminder_settings', 'company_reminder_settings_first_after_check', {
    check: 'first_after_days BETWEEN 1 AND 365',
  });
  pgm.addConstraint('company_reminder_settings', 'company_reminder_settings_repeat_check', {
    check: 'repeat_every_days BETWEEN 1 AND 365',
  });
  pgm.addConstraint('company_reminder_settings', 'company_reminder_settings_max_check', {
    check: 'max_reminders BETWEEN 1 AND 20',
  });

  pgm.createTable('overdue_reminder_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    invoice_id: { type: 'uuid', notNull: true },
    party_id: { type: 'uuid', notNull: true },
    reminder_sequence: { type: 'integer', notNull: true },
    due_date: { type: 'date', notNull: true },
    outstanding_paise: { type: 'bigint', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    acknowledged_at: { type: 'timestamptz' },
    acknowledged_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_status_check', {
    check: "status IN ('pending', 'acknowledged')",
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_amount_check', {
    check: 'outstanding_paise > 0',
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_sequence_check', {
    check: 'reminder_sequence >= 1',
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_company_invoice_unique', {
    unique: ['company_id', 'invoice_id', 'reminder_sequence'],
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_invoice_fk', {
    foreignKeys: { columns: ['company_id', 'invoice_id'], references: 'sales_invoices(company_id,id)', onDelete: 'cascade' },
  });
  pgm.addConstraint('overdue_reminder_events', 'overdue_reminder_events_party_fk', {
    foreignKeys: { columns: ['company_id', 'party_id'], references: 'company_parties(company_id,id)', onDelete: 'restrict' },
  });
  pgm.createIndex('overdue_reminder_events', ['company_id', 'status', 'created_at']);
  pgm.createIndex('overdue_reminder_events', ['company_id', 'invoice_id', 'created_at']);

  pgm.sql('ALTER TABLE company_reminder_settings ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE company_reminder_settings FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY company_reminder_settings_tenant_isolation ON company_reminder_settings USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON company_reminder_settings TO ledgerloop_app');

  pgm.sql('ALTER TABLE overdue_reminder_events ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE overdue_reminder_events FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY overdue_reminder_events_tenant_isolation ON overdue_reminder_events USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON overdue_reminder_events TO ledgerloop_app');

  // The worker must discover enabled tenants without receiving cross-tenant business data.
  // It receives only company ids, then establishes tenant context before reading invoices.
  pgm.sql(`
    CREATE FUNCTION ledgerloop_reminder_companies()
    RETURNS SETOF uuid
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT company_id
        FROM company_reminder_settings
       WHERE enabled = true
    $$;
  `);
  pgm.sql('REVOKE ALL ON FUNCTION ledgerloop_reminder_companies() FROM PUBLIC');
  pgm.sql('GRANT EXECUTE ON FUNCTION ledgerloop_reminder_companies() TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_reminder_companies()');
  pgm.dropTable('overdue_reminder_events');
  pgm.dropTable('company_reminder_settings');
};
