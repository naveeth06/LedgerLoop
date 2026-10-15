exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE company_document_sequences
      ADD COLUMN inventory_adjustment_next bigint NOT NULL DEFAULT 1;

    ALTER TABLE inventory_posting_accounts
      ADD COLUMN inventory_adjustment_account_id uuid;

    ALTER TABLE inventory_posting_accounts
      ADD CONSTRAINT inventory_posting_accounts_adjustment_account_fk
      FOREIGN KEY (company_id, inventory_adjustment_account_id)
      REFERENCES ledger_accounts(company_id, id)
      ON DELETE RESTRICT;

    CREATE TABLE inventory_adjustments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      adjustment_number bigint NOT NULL,
      adjustment_date date NOT NULL,
      item_id uuid NOT NULL,
      warehouse_id uuid NOT NULL,
      direction text NOT NULL CHECK (direction IN ('increase', 'decrease')),
      quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
      unit_cost_paise numeric(20,6) NOT NULL CHECK (unit_cost_paise >= 0),
      total_cost_paise bigint NOT NULL CHECK (total_cost_paise > 0),
      reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
      status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
      journal_entry_id uuid NOT NULL,
      reversal_of_id uuid,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, adjustment_number),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, warehouse_id) REFERENCES company_warehouses(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, reversal_of_id) REFERENCES inventory_adjustments(company_id, id) ON DELETE RESTRICT
    );
    ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inventory_adjustments FORCE ROW LEVEL SECURITY;
    CREATE POLICY inventory_adjustments_tenant_isolation ON inventory_adjustments
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON inventory_adjustments TO ledgerloop_app;
    CREATE INDEX inventory_adjustments_company_item_idx ON inventory_adjustments(company_id, item_id, warehouse_id);
    CREATE INDEX inventory_adjustments_company_date_idx ON inventory_adjustments(company_id, adjustment_date);
    CREATE UNIQUE INDEX inventory_adjustments_one_reversal_idx
      ON inventory_adjustments(company_id, reversal_of_id) WHERE reversal_of_id IS NOT NULL;

    CREATE FUNCTION ledgerloop_guard_inventory_adjustment() RETURNS trigger AS $$
    BEGIN
      IF OLD.company_id <> NEW.company_id OR OLD.id <> NEW.id OR OLD.item_id <> NEW.item_id
         OR OLD.warehouse_id <> NEW.warehouse_id OR OLD.direction <> NEW.direction
         OR OLD.quantity <> NEW.quantity OR OLD.unit_cost_paise <> NEW.unit_cost_paise
         OR OLD.total_cost_paise <> NEW.total_cost_paise OR OLD.journal_entry_id <> NEW.journal_entry_id
         OR OLD.reversal_of_id IS DISTINCT FROM NEW.reversal_of_id OR OLD.created_by IS DISTINCT FROM NEW.created_by
         OR OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'Posted inventory adjustment fields are immutable';
      END IF;
      IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
        RAISE EXCEPTION 'Reversed inventory adjustments cannot be reopened';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER inventory_adjustment_immutability_guard
      BEFORE UPDATE ON inventory_adjustments
      FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_inventory_adjustment();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS inventory_adjustment_immutability_guard ON inventory_adjustments;`);
  pgm.sql(`DROP FUNCTION IF EXISTS ledgerloop_guard_inventory_adjustment();`);
  pgm.sql(`DROP TABLE IF EXISTS inventory_adjustments;`);
  pgm.sql(`ALTER TABLE inventory_posting_accounts DROP CONSTRAINT IF EXISTS inventory_posting_accounts_adjustment_account_fk;`);
  pgm.sql(`ALTER TABLE inventory_posting_accounts DROP COLUMN IF EXISTS inventory_adjustment_account_id;`);
  pgm.sql(`ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS inventory_adjustment_next;`);
};
