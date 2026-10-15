exports.up = (pgm) => {
  pgm.createTable('journal_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    entry_number: { type: 'varchar(40)', notNull: true },
    entry_date: { type: 'date', notNull: true },
    memo: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'draft' },
    source_type: { type: 'text', notNull: true, default: 'manual' },
    created_by: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'restrict' },
    posted_by: { type: 'uuid', references: 'app_users', onDelete: 'restrict' },
    posted_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('journal_entries', 'journal_entries_status_check', { check: "status IN ('draft', 'posted')" });
  pgm.addConstraint('journal_entries', 'journal_entries_source_type_check', { check: "source_type IN ('manual', 'opening_balance', 'invoice', 'receipt', 'bill', 'payment', 'expense', 'reversal')" });
  pgm.addConstraint('journal_entries', 'journal_entries_company_number_unique', { unique: ['company_id', 'entry_number'] });
  pgm.addConstraint('journal_entries', 'journal_entries_company_id_id_unique', { unique: ['company_id', 'id'] });
  pgm.addConstraint('journal_entries', 'journal_entries_posted_metadata_check', {
    check: "(status = 'draft' AND posted_at IS NULL AND posted_by IS NULL) OR (status = 'posted' AND posted_at IS NOT NULL AND posted_by IS NOT NULL)",
  });
  pgm.createIndex('journal_entries', ['company_id', 'entry_date', 'status']);
  pgm.sql('ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY journal_entries_tenant_isolation ON journal_entries USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON journal_entries TO ledgerloop_app');
  pgm.sql('REVOKE DELETE ON journal_entries FROM ledgerloop_app');

  pgm.createTable('journal_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    journal_entry_id: { type: 'uuid', notNull: true },
    line_number: { type: 'integer', notNull: true },
    account_id: { type: 'uuid', notNull: true },
    description: { type: 'text' },
    debit_paise: { type: 'bigint', notNull: true, default: 0 },
    credit_paise: { type: 'bigint', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_entry_company_fk FOREIGN KEY (company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_company_fk FOREIGN KEY (company_id, account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT");
  pgm.addConstraint('journal_lines', 'journal_lines_entry_line_unique', { unique: ['journal_entry_id', 'line_number'] });
  pgm.addConstraint('journal_lines', 'journal_lines_line_number_positive', { check: 'line_number > 0' });
  pgm.addConstraint('journal_lines', 'journal_lines_amounts_nonnegative', { check: 'debit_paise >= 0 AND credit_paise >= 0' });
  pgm.addConstraint('journal_lines', 'journal_lines_exactly_one_side', { check: '(debit_paise > 0 AND credit_paise = 0) OR (credit_paise > 0 AND debit_paise = 0)' });
  pgm.createIndex('journal_lines', ['company_id', 'account_id']);
  pgm.createIndex('journal_lines', ['journal_entry_id', 'line_number']);
  pgm.sql('ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY journal_lines_tenant_isolation ON journal_lines USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON journal_lines TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON journal_lines FROM ledgerloop_app');

  pgm.sql(`
    CREATE FUNCTION ledgerloop_guard_journal_entry() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE debit_total numeric; credit_total numeric; line_count integer;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted journal entries are immutable; use a reversal' USING ERRCODE = '55000';
      END IF;
      IF NEW.status = 'posted' THEN
        SELECT COALESCE(SUM(debit_paise), 0), COALESCE(SUM(credit_paise), 0), COUNT(*)
          INTO debit_total, credit_total, line_count
          FROM journal_lines WHERE company_id = NEW.company_id AND journal_entry_id = NEW.id;
        IF line_count < 2 OR debit_total = 0 OR debit_total <> credit_total THEN
          RAISE EXCEPTION 'Journal entry must contain at least two lines and balanced non-zero totals' USING ERRCODE = '23514';
        END IF;
        IF NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
          RAISE EXCEPTION 'Posting user and timestamp are required' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER journal_entry_guard BEFORE INSERT OR UPDATE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_journal_entry();

    CREATE FUNCTION ledgerloop_guard_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_company uuid; target_entry uuid; entry_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN target_company := OLD.company_id; target_entry := OLD.journal_entry_id;
      ELSE target_company := NEW.company_id; target_entry := NEW.journal_entry_id; END IF;
      SELECT status INTO entry_status FROM journal_entries WHERE company_id = target_company AND id = target_entry;
      IF entry_status IS NULL THEN RAISE EXCEPTION 'Journal entry does not exist' USING ERRCODE = '23503'; END IF;
      IF entry_status <> 'draft' THEN
        RAISE EXCEPTION 'Lines on posted journal entries are immutable; use a reversal' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END; $$;
    CREATE TRIGGER journal_line_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_journal_line();
  `);
};
exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS journal_line_guard ON journal_lines');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_journal_line()');
  pgm.sql('DROP TRIGGER IF EXISTS journal_entry_guard ON journal_entries');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_journal_entry()');
  pgm.dropTable('journal_lines');
  pgm.dropTable('journal_entries');
};
