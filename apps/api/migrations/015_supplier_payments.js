exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE company_document_sequences
      ADD COLUMN supplier_payment_next bigint NOT NULL DEFAULT 1 CHECK (supplier_payment_next > 0);

    CREATE TABLE supplier_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      payment_number varchar(40) NOT NULL,
      payment_date date NOT NULL,
      party_id uuid NOT NULL,
      account_id uuid NOT NULL,
      amount_paise bigint NOT NULL CHECK (amount_paise > 0),
      reference varchar(160),
      notes text,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
      journal_entry_id uuid,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, payment_number),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE supplier_payments FORCE ROW LEVEL SECURITY;
    CREATE POLICY supplier_payments_tenant_isolation ON supplier_payments
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON supplier_payments TO ledgerloop_app;

    CREATE TABLE supplier_payment_allocations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      payment_id uuid NOT NULL,
      bill_id uuid NOT NULL,
      allocated_paise bigint NOT NULL CHECK (allocated_paise > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(payment_id, bill_id),
      FOREIGN KEY(company_id, payment_id) REFERENCES supplier_payments(company_id, id) ON DELETE CASCADE,
      FOREIGN KEY(company_id, bill_id) REFERENCES purchase_bills(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE supplier_payment_allocations FORCE ROW LEVEL SECURITY;
    CREATE POLICY supplier_payment_allocations_tenant_isolation ON supplier_payment_allocations
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_payment_allocations TO ledgerloop_app;

    CREATE INDEX supplier_payments_company_date_idx ON supplier_payments(company_id, payment_date);
    CREATE INDEX supplier_payments_company_party_status_idx ON supplier_payments(company_id, party_id, status);
    CREATE INDEX supplier_payment_allocations_company_bill_idx ON supplier_payment_allocations(company_id, bill_id);

    CREATE FUNCTION ledgerloop_guard_supplier_payment() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Posted or cancelled supplier payments are immutable; use a correction or reversal workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER supplier_payment_guard BEFORE UPDATE OR DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_supplier_payment();

    CREATE FUNCTION ledgerloop_guard_supplier_payment_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        SELECT status INTO target_status FROM supplier_payments WHERE company_id = OLD.company_id AND id = OLD.payment_id;
      ELSE
        SELECT status INTO target_status FROM supplier_payments WHERE company_id = NEW.company_id AND id = NEW.payment_id;
      END IF;
      IF target_status IS NULL THEN RAISE EXCEPTION 'Supplier payment does not exist' USING ERRCODE = '23503'; END IF;
      IF target_status <> 'draft' THEN RAISE EXCEPTION 'Allocations on posted or cancelled supplier payments are immutable' USING ERRCODE = '55000'; END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER supplier_payment_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_supplier_payment_allocation();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS supplier_payment_allocation_guard ON supplier_payment_allocations');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_supplier_payment_allocation()');
  pgm.sql('DROP TRIGGER IF EXISTS supplier_payment_guard ON supplier_payments');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_supplier_payment()');
  pgm.sql('DROP TABLE IF EXISTS supplier_payment_allocations');
  pgm.sql('DROP TABLE IF EXISTS supplier_payments');
  pgm.sql('ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS supplier_payment_next');
};
