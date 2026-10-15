exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE company_parties ADD CONSTRAINT company_parties_company_id_id_unique UNIQUE (company_id, id);

    CREATE TABLE company_document_sequences (
      company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      quotation_next bigint NOT NULL DEFAULT 1 CHECK (quotation_next > 0),
      invoice_next bigint NOT NULL DEFAULT 1 CHECK (invoice_next > 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE company_document_sequences ENABLE ROW LEVEL SECURITY;
    ALTER TABLE company_document_sequences FORCE ROW LEVEL SECURITY;
    CREATE POLICY company_document_sequences_tenant_isolation ON company_document_sequences
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON company_document_sequences TO ledgerloop_app;

    CREATE TABLE sales_quotations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      quotation_number varchar(40) NOT NULL, quotation_date date NOT NULL, valid_until date,
      party_id uuid NOT NULL, branch_id uuid, place_of_supply_state_code varchar(2) NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','cancelled')),
      subtotal_paise bigint NOT NULL DEFAULT 0, discount_paise bigint NOT NULL DEFAULT 0, taxable_paise bigint NOT NULL DEFAULT 0,
      cgst_paise bigint NOT NULL DEFAULT 0, sgst_paise bigint NOT NULL DEFAULT 0, igst_paise bigint NOT NULL DEFAULT 0, total_paise bigint NOT NULL DEFAULT 0,
      notes text, created_by uuid REFERENCES app_users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, quotation_number), UNIQUE(company_id, id),
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT,
      CHECK(place_of_supply_state_code ~ '^[0-9]{2}$'),
      CHECK(subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0)
    );
    ALTER TABLE sales_quotations ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_quotations FORCE ROW LEVEL SECURITY;
    CREATE POLICY sales_quotations_tenant_isolation ON sales_quotations USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON sales_quotations TO ledgerloop_app;

    CREATE TABLE sales_quotation_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, quotation_id uuid NOT NULL, line_number integer NOT NULL,
      item_id uuid NOT NULL, description text NOT NULL, quantity numeric(20,6) NOT NULL CHECK(quantity > 0), unit_price_paise bigint NOT NULL CHECK(unit_price_paise >= 0),
      discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise >= 0), gst_rate_bps integer NOT NULL CHECK(gst_rate_bps BETWEEN 0 AND 10000),
      taxable_paise bigint NOT NULL CHECK(taxable_paise >= 0), cgst_paise bigint NOT NULL CHECK(cgst_paise >= 0), sgst_paise bigint NOT NULL CHECK(sgst_paise >= 0),
      igst_paise bigint NOT NULL CHECK(igst_paise >= 0), total_paise bigint NOT NULL CHECK(total_paise >= 0), created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(quotation_id, line_number), FOREIGN KEY(company_id, quotation_id) REFERENCES sales_quotations(company_id, id) ON DELETE CASCADE,
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE sales_quotation_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_quotation_lines FORCE ROW LEVEL SECURITY;
    CREATE POLICY sales_quotation_lines_tenant_isolation ON sales_quotation_lines USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON sales_quotation_lines TO ledgerloop_app;

    CREATE TABLE sales_invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      invoice_number varchar(40) NOT NULL, invoice_date date NOT NULL, due_date date, party_id uuid NOT NULL, branch_id uuid,
      seller_gstin varchar(15), buyer_gstin varchar(15), place_of_supply_state_code varchar(2) NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','cancelled')),
      subtotal_paise bigint NOT NULL DEFAULT 0, discount_paise bigint NOT NULL DEFAULT 0, taxable_paise bigint NOT NULL DEFAULT 0,
      cgst_paise bigint NOT NULL DEFAULT 0, sgst_paise bigint NOT NULL DEFAULT 0, igst_paise bigint NOT NULL DEFAULT 0, total_paise bigint NOT NULL DEFAULT 0,
      notes text, created_by uuid REFERENCES app_users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, invoice_number), UNIQUE(company_id, id),
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT,
      CHECK(place_of_supply_state_code ~ '^[0-9]{2}$'),
      CHECK(subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0)
    );
    ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;
    CREATE POLICY sales_invoices_tenant_isolation ON sales_invoices USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON sales_invoices TO ledgerloop_app;

    CREATE TABLE sales_invoice_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, invoice_id uuid NOT NULL, line_number integer NOT NULL,
      item_id uuid NOT NULL, description text NOT NULL, quantity numeric(20,6) NOT NULL CHECK(quantity > 0), unit_price_paise bigint NOT NULL CHECK(unit_price_paise >= 0),
      discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise >= 0), gst_rate_bps integer NOT NULL CHECK(gst_rate_bps BETWEEN 0 AND 10000),
      taxable_paise bigint NOT NULL CHECK(taxable_paise >= 0), cgst_paise bigint NOT NULL CHECK(cgst_paise >= 0), sgst_paise bigint NOT NULL CHECK(sgst_paise >= 0),
      igst_paise bigint NOT NULL CHECK(igst_paise >= 0), total_paise bigint NOT NULL CHECK(total_paise >= 0), created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(invoice_id, line_number), FOREIGN KEY(company_id, invoice_id) REFERENCES sales_invoices(company_id, id) ON DELETE CASCADE,
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_invoice_lines FORCE ROW LEVEL SECURITY;
    CREATE POLICY sales_invoice_lines_tenant_isolation ON sales_invoice_lines USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON sales_invoice_lines TO ledgerloop_app;

    CREATE INDEX sales_quotations_company_date_idx ON sales_quotations(company_id, quotation_date);
    CREATE INDEX sales_quotations_company_party_status_idx ON sales_quotations(company_id, party_id, status);
    CREATE INDEX sales_invoices_company_date_idx ON sales_invoices(company_id, invoice_date);
    CREATE INDEX sales_invoices_company_party_status_idx ON sales_invoices(company_id, party_id, status);

    CREATE FUNCTION ledgerloop_guard_sales_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Issued or cancelled sales invoices are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_invoice_guard BEFORE UPDATE OR DELETE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_invoice();

    CREATE FUNCTION ledgerloop_guard_sales_invoice_line() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN SELECT status INTO target_status FROM sales_invoices WHERE company_id = OLD.company_id AND id = OLD.invoice_id;
      ELSE SELECT status INTO target_status FROM sales_invoices WHERE company_id = NEW.company_id AND id = NEW.invoice_id; END IF;
      IF target_status IS NULL THEN RAISE EXCEPTION 'Sales invoice does not exist' USING ERRCODE = '23503'; END IF;
      IF target_status <> 'draft' THEN RAISE EXCEPTION 'Lines on issued or cancelled sales invoices are immutable' USING ERRCODE = '55000'; END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER sales_invoice_line_guard BEFORE UPDATE OR DELETE ON sales_invoice_lines FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_sales_invoice_line();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS sales_invoice_line_guard ON sales_invoice_lines');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_invoice_line()');
  pgm.sql('DROP TRIGGER IF EXISTS sales_invoice_guard ON sales_invoices');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_sales_invoice()');
  pgm.sql('DROP TABLE IF EXISTS sales_invoice_lines');
  pgm.sql('DROP TABLE IF EXISTS sales_invoices');
  pgm.sql('DROP TABLE IF EXISTS sales_quotation_lines');
  pgm.sql('DROP TABLE IF EXISTS sales_quotations');
  pgm.sql('DROP TABLE IF EXISTS company_document_sequences');
  pgm.sql('ALTER TABLE company_parties DROP CONSTRAINT IF EXISTS company_parties_company_id_id_unique');
};
