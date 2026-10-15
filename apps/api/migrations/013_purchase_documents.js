exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE company_document_sequences
      ADD COLUMN purchase_order_next bigint NOT NULL DEFAULT 1 CHECK (purchase_order_next > 0),
      ADD COLUMN purchase_bill_next bigint NOT NULL DEFAULT 1 CHECK (purchase_bill_next > 0);

    CREATE TABLE purchase_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      purchase_order_number varchar(40) NOT NULL,
      order_date date NOT NULL,
      expected_date date,
      party_id uuid NOT NULL,
      branch_id uuid,
      place_of_supply_state_code varchar(2) NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','cancelled')),
      subtotal_paise bigint NOT NULL DEFAULT 0,
      discount_paise bigint NOT NULL DEFAULT 0,
      taxable_paise bigint NOT NULL DEFAULT 0,
      cgst_paise bigint NOT NULL DEFAULT 0,
      sgst_paise bigint NOT NULL DEFAULT 0,
      igst_paise bigint NOT NULL DEFAULT 0,
      total_paise bigint NOT NULL DEFAULT 0,
      notes text,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, purchase_order_number), UNIQUE(company_id, id),
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT,
      CHECK(place_of_supply_state_code ~ '^[0-9]{2}$'),
      CHECK(subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0)
    );
    ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
    CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON purchase_orders TO ledgerloop_app;

    CREATE TABLE purchase_order_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      purchase_order_id uuid NOT NULL,
      line_number integer NOT NULL,
      item_id uuid NOT NULL,
      description text NOT NULL,
      quantity numeric(20,6) NOT NULL CHECK(quantity > 0),
      unit_price_paise bigint NOT NULL CHECK(unit_price_paise >= 0),
      discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise >= 0),
      gst_rate_bps integer NOT NULL CHECK(gst_rate_bps BETWEEN 0 AND 10000),
      taxable_paise bigint NOT NULL CHECK(taxable_paise >= 0),
      cgst_paise bigint NOT NULL CHECK(cgst_paise >= 0),
      sgst_paise bigint NOT NULL CHECK(sgst_paise >= 0),
      igst_paise bigint NOT NULL CHECK(igst_paise >= 0),
      total_paise bigint NOT NULL CHECK(total_paise >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(purchase_order_id, line_number),
      FOREIGN KEY(company_id, purchase_order_id) REFERENCES purchase_orders(company_id, id) ON DELETE CASCADE,
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE purchase_order_lines FORCE ROW LEVEL SECURITY;
    CREATE POLICY purchase_order_lines_tenant_isolation ON purchase_order_lines
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON purchase_order_lines TO ledgerloop_app;

    CREATE TABLE purchase_bills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      bill_number varchar(40) NOT NULL,
      bill_date date NOT NULL,
      due_date date,
      supplier_invoice_number varchar(80),
      party_id uuid NOT NULL,
      branch_id uuid,
      place_of_supply_state_code varchar(2) NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','received','cancelled')),
      subtotal_paise bigint NOT NULL DEFAULT 0,
      discount_paise bigint NOT NULL DEFAULT 0,
      taxable_paise bigint NOT NULL DEFAULT 0,
      cgst_paise bigint NOT NULL DEFAULT 0,
      sgst_paise bigint NOT NULL DEFAULT 0,
      igst_paise bigint NOT NULL DEFAULT 0,
      total_paise bigint NOT NULL DEFAULT 0,
      notes text,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, bill_number), UNIQUE(company_id, id),
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT,
      CHECK(place_of_supply_state_code ~ '^[0-9]{2}$'),
      CHECK(subtotal_paise >= 0 AND discount_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0)
    );
    ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
    ALTER TABLE purchase_bills FORCE ROW LEVEL SECURITY;
    CREATE POLICY purchase_bills_tenant_isolation ON purchase_bills
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON purchase_bills TO ledgerloop_app;

    CREATE TABLE purchase_bill_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      purchase_bill_id uuid NOT NULL,
      line_number integer NOT NULL,
      item_id uuid NOT NULL,
      description text NOT NULL,
      quantity numeric(20,6) NOT NULL CHECK(quantity > 0),
      unit_price_paise bigint NOT NULL CHECK(unit_price_paise >= 0),
      discount_paise bigint NOT NULL DEFAULT 0 CHECK(discount_paise >= 0),
      gst_rate_bps integer NOT NULL CHECK(gst_rate_bps BETWEEN 0 AND 10000),
      taxable_paise bigint NOT NULL CHECK(taxable_paise >= 0),
      cgst_paise bigint NOT NULL CHECK(cgst_paise >= 0),
      sgst_paise bigint NOT NULL CHECK(sgst_paise >= 0),
      igst_paise bigint NOT NULL CHECK(igst_paise >= 0),
      total_paise bigint NOT NULL CHECK(total_paise >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(purchase_bill_id, line_number),
      FOREIGN KEY(company_id, purchase_bill_id) REFERENCES purchase_bills(company_id, id) ON DELETE CASCADE,
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE purchase_bill_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE purchase_bill_lines FORCE ROW LEVEL SECURITY;
    CREATE POLICY purchase_bill_lines_tenant_isolation ON purchase_bill_lines
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON purchase_bill_lines TO ledgerloop_app;

    CREATE INDEX purchase_orders_company_date_idx ON purchase_orders(company_id, order_date);
    CREATE INDEX purchase_orders_company_party_status_idx ON purchase_orders(company_id, party_id, status);
    CREATE INDEX purchase_bills_company_date_idx ON purchase_bills(company_id, bill_date);
    CREATE INDEX purchase_bills_company_party_status_idx ON purchase_bills(company_id, party_id, status);

    CREATE FUNCTION ledgerloop_guard_purchase_bill() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Received or cancelled purchase bills are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER purchase_bill_guard BEFORE UPDATE OR DELETE ON purchase_bills FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_purchase_bill();

    CREATE FUNCTION ledgerloop_guard_purchase_bill_line() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN SELECT status INTO target_status FROM purchase_bills WHERE company_id = OLD.company_id AND id = OLD.purchase_bill_id;
      ELSE SELECT status INTO target_status FROM purchase_bills WHERE company_id = NEW.company_id AND id = NEW.purchase_bill_id; END IF;
      IF target_status IS NULL THEN RAISE EXCEPTION 'Purchase bill does not exist' USING ERRCODE = '23503'; END IF;
      IF target_status <> 'draft' THEN RAISE EXCEPTION 'Lines on received or cancelled purchase bills are immutable' USING ERRCODE = '55000'; END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER purchase_bill_line_guard BEFORE UPDATE OR DELETE ON purchase_bill_lines FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_purchase_bill_line();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS purchase_bill_line_guard ON purchase_bill_lines');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_purchase_bill_line()');
  pgm.sql('DROP TRIGGER IF EXISTS purchase_bill_guard ON purchase_bills');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_purchase_bill()');
  pgm.sql('DROP TABLE IF EXISTS purchase_bill_lines');
  pgm.sql('DROP TABLE IF EXISTS purchase_bills');
  pgm.sql('DROP TABLE IF EXISTS purchase_order_lines');
  pgm.sql('DROP TABLE IF EXISTS purchase_orders');
  pgm.sql('ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS purchase_bill_next');
  pgm.sql('ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS purchase_order_next');
};
