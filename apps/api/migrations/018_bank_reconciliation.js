exports.up = (pgm) => {
  pgm.addColumns('bank_statement_transactions', {
    matched_journal_line_id: { type: 'uuid' },
    matched_at: { type: 'timestamptz' },
    matched_by: { type: 'uuid', references: 'app_users', onDelete: 'restrict' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // journal_lines.id is globally unique, but the application uses composite
  // tenant foreign keys throughout the schema. PostgreSQL requires the
  // referenced column set itself to be backed by a unique constraint/index.
  pgm.sql(`
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_company_id_id_unique
      UNIQUE (company_id, id)
  `);

  pgm.sql(`
    ALTER TABLE bank_statement_transactions
      ADD CONSTRAINT bank_statement_txn_matched_line_company_fk
      FOREIGN KEY (company_id, matched_journal_line_id)
      REFERENCES journal_lines(company_id, id)
      ON DELETE RESTRICT
  `);

  pgm.sql(`
    ALTER TABLE bank_statement_transactions
      ADD CONSTRAINT bank_statement_txn_match_metadata_check
      CHECK (
        (status = 'unreconciled' AND matched_journal_line_id IS NULL AND matched_at IS NULL AND matched_by IS NULL)
        OR
        (status IN ('matched', 'reconciled') AND matched_journal_line_id IS NOT NULL AND matched_at IS NOT NULL AND matched_by IS NOT NULL)
      )
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX bank_statement_txn_one_match_per_journal_line
      ON bank_statement_transactions(company_id, matched_journal_line_id)
      WHERE matched_journal_line_id IS NOT NULL
  `);

  pgm.createIndex('bank_statement_transactions', ['company_id', 'bank_account_id', 'status', 'transaction_date']);
  pgm.createIndex('bank_statement_transactions', ['company_id', 'matched_journal_line_id']);

  pgm.sql(`
    CREATE FUNCTION ledgerloop_guard_bank_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.status = 'reconciled' THEN
        RAISE EXCEPTION 'Reconciled bank transactions are immutable; use an explicit unreconciliation workflow' USING ERRCODE = '55000';
      END IF;
      IF NEW.status = 'unreconciled' THEN
        IF NEW.matched_journal_line_id IS NOT NULL OR NEW.matched_at IS NOT NULL OR NEW.matched_by IS NOT NULL THEN
          RAISE EXCEPTION 'Unreconciled transactions cannot contain a journal match' USING ERRCODE = '23514';
        END IF;
      ELSE
        IF NEW.matched_journal_line_id IS NULL OR NEW.matched_at IS NULL OR NEW.matched_by IS NULL THEN
          RAISE EXCEPTION 'Matched transactions require journal match metadata' USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END; $$;

    CREATE TRIGGER bank_reconciliation_guard
      BEFORE UPDATE ON bank_statement_transactions
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_bank_reconciliation();
  `);

  pgm.sql('GRANT UPDATE ON bank_statement_transactions TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS bank_reconciliation_guard ON bank_statement_transactions');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_bank_reconciliation()');
  pgm.sql('DROP INDEX IF EXISTS bank_statement_txn_one_match_per_journal_line');
  pgm.sql('ALTER TABLE bank_statement_transactions DROP CONSTRAINT IF EXISTS bank_statement_txn_match_metadata_check');
  pgm.sql('ALTER TABLE bank_statement_transactions DROP CONSTRAINT IF EXISTS bank_statement_txn_matched_line_company_fk');
  pgm.dropIndex('bank_statement_transactions', ['company_id', 'bank_account_id', 'status', 'transaction_date']);
  pgm.dropIndex('bank_statement_transactions', ['company_id', 'matched_journal_line_id']);
  pgm.dropColumns('bank_statement_transactions', ['matched_journal_line_id', 'matched_at', 'matched_by', 'updated_at']);
  pgm.sql('ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS journal_lines_company_id_id_unique');
};
