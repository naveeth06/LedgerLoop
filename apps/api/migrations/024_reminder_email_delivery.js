exports.up = (pgm) => {
  pgm.addColumn('company_parties', {
    email_reminders_enabled: { type: 'boolean', notNull: true, default: true },
  });

  pgm.createTable('reminder_email_deliveries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    reminder_event_id: { type: 'uuid', notNull: true },
    party_id: { type: 'uuid', notNull: true },
    recipient_email: { type: 'text', notNull: true },
    subject: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    attempt_count: { type: 'integer', notNull: true, default: 0 },
    next_attempt_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_attempt_at: { type: 'timestamptz' },
    sent_at: { type: 'timestamptz' },
    provider_message_id: { type: 'text' },
    last_error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('reminder_email_deliveries', 'reminder_email_deliveries_status_check', {
    check: "status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')",
  });
  pgm.addConstraint('reminder_email_deliveries_attempt_check', {
    check: 'attempt_count >= 0 AND attempt_count <= 10',
  });
  pgm.addConstraint('reminder_email_deliveries_event_fk', {
    foreignKeys: { columns: ['company_id', 'reminder_event_id'], references: 'overdue_reminder_events(company_id,id)', onDelete: 'cascade' },
  });
  pgm.addConstraint('reminder_email_deliveries_party_fk', {
    foreignKeys: { columns: ['company_id', 'party_id'], references: 'company_parties(company_id,id)', onDelete: 'restrict' },
  });
  pgm.addConstraint('reminder_email_deliveries_event_unique', {
    unique: ['company_id', 'reminder_event_id'],
  });
  pgm.createIndex('reminder_email_deliveries', ['company_id', 'status', 'next_attempt_at']);

  pgm.sql('ALTER TABLE reminder_email_deliveries ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE reminder_email_deliveries FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY reminder_email_deliveries_tenant_isolation ON reminder_email_deliveries USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON reminder_email_deliveries TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('reminder_email_deliveries');
  pgm.dropColumn('company_parties', 'email_reminders_enabled');
};
