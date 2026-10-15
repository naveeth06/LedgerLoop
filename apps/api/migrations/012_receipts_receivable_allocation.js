exports.up = (pgm) => {
  pgm.addColumn('company_document_sequences', {
    receipt_next: { type: 'bigint', notNull: true, default: 1 },
  });
  pgm.addConstraint('company_document_sequences', 'company_document_sequences_receipt_next_check', {
    check: 'receipt_next > 0',
  });

  pgm.createTable('sales_receipts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    receipt_number: { type: 'varchar(40)', notNull: true },
    receipt_date: { type: 'date', notNull: true },
    party_id: { type: 'uuid', notNull: true },
    account_id: { type: 'uuid', notNull: true },
    amount_paise: { type: 'bigint', notNull: true },
    reference: { type: 'varchar(160)' },
    notes: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'draft' },
    journal_entry_id: { type: 'uuid' },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_status_check', {
    check: "status IN ('draft', 'posted')",
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_amount_positive', {
    check: 'amount_paise > 0',
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_company_number_unique', {
    unique: ['company_id', 'receipt_number'],
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_company_id_id_unique', {
    unique: ['company_id', 'id'],
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_party_same_company_fk', {
    foreignKeys: {
      columns: ['company_id', 'party_id'],
      references: 'company_parties(company_id, id)',
      onDelete: 'restrict',
    },
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_account_same_company_fk', {
    foreignKeys: {
      columns: ['company_id', 'account_id'],
      references: 'ledger_accounts(company_id, id)',
      onDelete: 'restrict',
    },
  });
  pgm.addConstraint('sales_receipts', 'sales_receipts_journal_same_company_fk', {
    foreignKeys: {
      columns: ['company_id', 'journal_entry_id'],
      references: 'journal_entries(company_id, id)',
      onDelete: 'restrict',
    },
  });
  pgm.sql('ALTER TABLE sales_receipts ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_receipts FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_receipts_tenant_isolation ON sales_receipts USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON sales_receipts TO ledgerloop_app');
  pgm.sql('REVOKE DELETE ON sales_receipts FROM ledgerloop_app');

  pgm.createTable('sales_receipt_allocations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    receipt_id: { type: 'uuid', notNull: true },
    invoice_id: { type: 'uuid', notNull: true },
    allocated_paise: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sales_receipt_allocations', 'sales_receipt_allocations_amount_positive', {
    check: 'allocated_paise > 0',
  });
  pgm.addConstraint('sales_receipt_allocations', 'sales_receipt_allocations_receipt_invoice_unique', {
    unique: ['receipt_id', 'invoice_id'],
  });
  pgm.sql("ALTER TABLE sales_receipt_allocations ADD CONSTRAINT sales_receipt_allocations_receipt_same_company_fk FOREIGN KEY (company_id, receipt_id) REFERENCES sales_receipts(company_id, id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE sales_receipt_allocations ADD CONSTRAINT sales_receipt_allocations_invoice_same_company_fk FOREIGN KEY (company_id, invoice_id) REFERENCES sales_invoices(company_id, id) ON DELETE RESTRICT");
  pgm.sql('ALTER TABLE sales_receipt_allocations ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_receipt_allocations FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_receipt_allocations_tenant_isolation ON sales_receipt_allocations USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON sales_receipt_allocations TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON sales_receipt_allocations FROM ledgerloop_app');
  pgm.createIndex('sales_receipts', ['company_id', 'party_id', 'receipt_date']);
  pgm.createIndex('sales_receipts', ['company_id', 'status']);
  pgm.createIndex('sales_receipt_allocations', ['company_id', 'invoice_id']);

  pgm.sql(`
    CREATE FUNCTION ledgerloop_guard_sales_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted receipts are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted receipts are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      IF NEW.status = 'posted' AND (NEW.journal_entry_id IS NULL) THEN
        RAISE EXCEPTION 'Posted receipts require a journal entry' USING ERRCODE = '23514';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_receipts
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_receipt();

    CREATE FUNCTION ledgerloop_guard_sales_receipt_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        SELECT status INTO target_status FROM sales_receipts WHERE company_id = OLD.company_id AND id = OLD.receipt_id;
      ELSE
        SELECT status INTO target_status FROM sales_receipts WHERE company_id = NEW.company_id AND id = NEW.receipt_id;
      END IF;
      IF target_status IS NULL THEN
        RAISE EXCEPTION 'Sales receipt does not exist' USING ERRCODE = '23503';
      END IF;
      IF target_status <> 'draft' THEN
        RAISE EXCEPTION 'Allocations on posted receipts are immutable' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_receipt_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_receipt_allocations
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_receipt_allocation();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sales_receipt_allocation_guard ON sales_receipt_allocations');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_receipt_allocation()');
  pgm.sql('DROP TRIGGER IF EXISTS sales_receipt_guard ON sales_receipts');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_receipt()');
  pgm.dropTable('sales_receipt_allocations');
  pgm.dropTable('sales_receipts');
  pgm.dropConstraint('company_document_sequences', 'company_document_sequences_receipt_next_check');
  pgm.dropColumn('company_document_sequences', 'receipt_next');
};
