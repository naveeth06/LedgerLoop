exports.up = (pgm) => {
  pgm.createTable('company_document_sequences', {
    company_id: { type: 'uuid', primaryKey: true, references: 'companies', onDelete: 'cascade' },
    quotation_next: { type: 'bigint', notNull: true, default: 1 },
    invoice_next: { type: 'bigint', notNull: true, default: 1 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('company_document_sequences', 'company_document_sequences_quotation_positive', { check: 'quotation_next > 0' });
  pgm.addConstraint('company_document_sequences', 'company_document_sequences_invoice_positive', { check: 'invoice_next > 0' });
  pgm.sql('ALTER TABLE company_document_sequences ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE company_document_sequences FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY company_document_sequences_tenant_isolation ON company_document_sequences USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON company_document_sequences TO ledgerloop_app');

  pgm.createTable('sales_quotations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    quotation_number: { type: 'varchar(40)', notNull: true },
    quotation_date: { type: 'date', notNull: true },
    valid_until: { type: 'date' },
    party_id: { type: 'uuid', notNull: true },
    branch_id: { type: 'uuid' },
    place_of_supply_state_code: { type: 'varchar(2)', notNull: true },
    status: { type: 'text', notNull: true, default: 'draft' },
    subtotal_paise: { type: 'bigint', notNull: true, default: 0 },
    discount_paise: { type: 'bigint', notNull: true, default: 0 },
    taxable_paise: { type: 'bigint', notNull: true, default: 0 },
    cgst_paise: { type: 'bigint', notNull: true, default: 0 },
    sgst_paise: { type: 'bigint', notNull: true, default: 0 },
    igst_paise: { type: 'bigint', notNull: true, default: 0 },
    total_paise: { type: 'bigint', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sales_quotations', 'sales_quotations_party_company_fk', { foreignKeys: { columns: ['company_id', 'party_id'], references: 'company_parties(company_id, id)', onDelete: 'restrict' } });
  pgm.addConstraint('sales_quotations', 'sales_quotations_branch_company_fk', { foreignKeys: { columns: ['company_id', 'branch_id'], references: 'branches(company_id, id)', onDelete: 'restrict' } });
  pgm.addConstraint('sales_quotations', 'sales_quotations_status_check', { check: "status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')" });
  pgm.addConstraint('sales_quotations', 'sales_quotations_state_check', { check: "place_of_supply_state_code ~ '^[0-9]{2}$'" });
  pgm.addConstraint('sales_quotations', 'sales_quotations_amounts_nonnegative', { check: 'subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0' });
  pgm.addConstraint('sales_quotations', 'sales_quotations_number_unique', { unique: ['company_id', 'quotation_number'] });
  pgm.sql("ALTER TABLE sales_quotations ADD CONSTRAINT sales_quotations_branch_company_fk2 FOREIGN KEY (company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT");
  pgm.sql('ALTER TABLE sales_quotations ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_quotations FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_quotations_tenant_isolation ON sales_quotations USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON sales_quotations TO ledgerloop_app');

  pgm.createTable('sales_quotation_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    quotation_id: { type: 'uuid', notNull: true },
    line_number: { type: 'integer', notNull: true },
    item_id: { type: 'uuid', notNull: true },
    description: { type: 'text', notNull: true },
    quantity: { type: 'numeric(20,6)', notNull: true },
    unit_price_paise: { type: 'bigint', notNull: true },
    discount_paise: { type: 'bigint', notNull: true, default: 0 },
    gst_rate_bps: { type: 'integer', notNull: true },
    taxable_paise: { type: 'bigint', notNull: true },
    cgst_paise: { type: 'bigint', notNull: true },
    sgst_paise: { type: 'bigint', notNull: true },
    igst_paise: { type: 'bigint', notNull: true },
    total_paise: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("ALTER TABLE sales_quotation_lines ADD CONSTRAINT sales_quotation_lines_quotation_company_fk FOREIGN KEY (company_id, quotation_id) REFERENCES sales_quotations(company_id, id) ON DELETE CASCADE");
  pgm.sql("ALTER TABLE sales_quotation_lines ADD CONSTRAINT sales_quotation_lines_item_company_fk FOREIGN KEY (company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT");
  pgm.addConstraint('sales_quotation_lines', 'sales_quotation_lines_unique_line', { unique: ['quotation_id', 'line_number'] });
  pgm.addConstraint('sales_quotation_lines', 'sales_quotation_lines_positive_quantity', { check: 'quantity > 0' });
  pgm.addConstraint('sales_quotation_lines', 'sales_quotation_lines_amounts_nonnegative', { check: 'unit_price_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0' });
  pgm.addConstraint('sales_quotation_lines', 'sales_quotation_lines_gst_rate_check', { check: 'gst_rate_bps >= 0 AND gst_rate_bps <= 10000' });
  pgm.sql('ALTER TABLE sales_quotation_lines ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_quotation_lines FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_quotation_lines_tenant_isolation ON sales_quotation_lines USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON sales_quotation_lines TO ledgerloop_app');

  pgm.createTable('sales_invoices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    invoice_number: { type: 'varchar(40)', notNull: true },
    invoice_date: { type: 'date', notNull: true },
    due_date: { type: 'date' },
    party_id: { type: 'uuid', notNull: true },
    branch_id: { type: 'uuid' },
    seller_gstin: { type: 'varchar(15)' },
    buyer_gstin: { type: 'varchar(15)' },
    place_of_supply_state_code: { type: 'varchar(2)', notNull: true },
    status: { type: 'text', notNull: true, default: 'draft' },
    subtotal_paise: { type: 'bigint', notNull: true, default: 0 },
    discount_paise: { type: 'bigint', notNull: true, default: 0 },
    taxable_paise: { type: 'bigint', notNull: true, default: 0 },
    cgst_paise: { type: 'bigint', notNull: true, default: 0 },
    sgst_paise: { type: 'bigint', notNull: true, default: 0 },
    igst_paise: { type: 'bigint', notNull: true, default: 0 },
    total_paise: { type: 'bigint', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sales_invoices', 'sales_invoices_party_company_fk', { foreignKeys: { columns: ['company_id', 'party_id'], references: 'company_parties(company_id, id)', onDelete: 'restrict' } });
  pgm.addConstraint('sales_invoices', 'sales_invoices_status_check', { check: "status IN ('draft', 'issued', 'cancelled')" });
  pgm.addConstraint('sales_invoices', 'sales_invoices_state_check', { check: "place_of_supply_state_code ~ '^[0-9]{2}$'" });
  pgm.addConstraint('sales_invoices', 'sales_invoices_amounts_nonnegative', { check: 'subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0' });
  pgm.addConstraint('sales_invoices', 'sales_invoices_number_unique', { unique: ['company_id', 'invoice_number'] });
  pgm.sql("ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_branch_company_fk FOREIGN KEY (company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT");
  pgm.sql('ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_invoices_tenant_isolation ON sales_invoices USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON sales_invoices TO ledgerloop_app');

  pgm.createTable('sales_invoice_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true },
    invoice_id: { type: 'uuid', notNull: true },
    line_number: { type: 'integer', notNull: true },
    item_id: { type: 'uuid', notNull: true },
    description: { type: 'text', notNull: true },
    quantity: { type: 'numeric(20,6)', notNull: true },
    unit_price_paise: { type: 'bigint', notNull: true },
    discount_paise: { type: 'bigint', notNull: true, default: 0 },
    gst_rate_bps: { type: 'integer', notNull: true },
    taxable_paise: { type: 'bigint', notNull: true },
    cgst_paise: { type: 'bigint', notNull: true },
    sgst_paise: { type: 'bigint', notNull: true },
    igst_paise: { type: 'bigint', notNull: true },
    total_paise: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("ALTER TABLE sales_invoice_lines ADD CONSTRAINT sales_invoice_lines_invoice_company_fk FOREIGN KEY (company_id, invoice_id) REFERENCES sales_invoices(company_id, id) ON DELETE CASCADE");
  pgm.sql("ALTER TABLE sales_invoice_lines ADD CONSTRAINT sales_invoice_lines_item_company_fk FOREIGN KEY (company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT");
  pgm.addConstraint('sales_invoice_lines', 'sales_invoice_lines_unique_line', { unique: ['invoice_id', 'line_number'] });
  pgm.addConstraint('sales_invoice_lines', 'sales_invoice_lines_positive_quantity', { check: 'quantity > 0' });
  pgm.addConstraint('sales_invoice_lines', 'sales_invoice_lines_amounts_nonnegative', { check: 'unit_price_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0' });
  pgm.addConstraint('sales_invoice_lines', 'sales_invoice_lines_gst_rate_check', { check: 'gst_rate_bps >= 0 AND gst_rate_bps <= 10000' });
  pgm.sql('ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE sales_invoice_lines FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY sales_invoice_lines_tenant_isolation ON sales_invoice_lines USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON sales_invoice_lines TO ledgerloop_app');

  pgm.createIndex('sales_quotations', ['company_id', 'quotation_date']);
  pgm.createIndex('sales_quotations', ['company_id', 'party_id', 'status']);
  pgm.createIndex('sales_invoices', ['company_id', 'invoice_date']);
  pgm.createIndex('sales_invoices', ['company_id', 'party_id', 'status']);

  pgm.sql(`
    CREATE FUNCTION ledgerloop_guard_sales_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Issued or cancelled sales invoices are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Issued or cancelled sales invoices are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_invoice_guard BEFORE UPDATE OR DELETE ON sales_invoices
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_invoice();

    CREATE FUNCTION ledgerloop_guard_sales_invoice_line() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        SELECT status INTO target_status FROM sales_invoices WHERE company_id = OLD.company_id AND id = OLD.invoice_id;
      ELSE
        SELECT status INTO target_status FROM sales_invoices WHERE company_id = NEW.company_id AND id = NEW.invoice_id;
      END IF;
      IF target_status IS NULL THEN RAISE EXCEPTION 'Sales invoice does not exist' USING ERRCODE = '23503'; END IF;
      IF target_status <> 'draft' THEN
        RAISE EXCEPTION 'Lines on issued or cancelled sales invoices are immutable' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_invoice_line_guard BEFORE UPDATE OR DELETE ON sales_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_invoice_line();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sales_invoice_line_guard ON sales_invoice_lines');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_invoice_line()');
  pgm.sql('DROP TRIGGER IF EXISTS sales_invoice_guard ON sales_invoices');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_invoice()');
  pgm.dropTable('sales_invoice_lines');
  pgm.dropTable('sales_invoices');
  pgm.dropTable('sales_quotation_lines');
  pgm.dropTable('sales_quotations');
  pgm.dropTable('company_document_sequences');
};
