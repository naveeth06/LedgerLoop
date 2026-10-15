exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sales_invoice_lines
      ADD COLUMN warehouse_id uuid;
    ALTER TABLE purchase_bill_lines
      ADD COLUMN warehouse_id uuid;

    ALTER TABLE sales_invoice_lines
      ADD CONSTRAINT sales_invoice_lines_warehouse_fk
      FOREIGN KEY (company_id, warehouse_id)
      REFERENCES company_warehouses(company_id, id)
      ON DELETE RESTRICT;
    ALTER TABLE purchase_bill_lines
      ADD CONSTRAINT purchase_bill_lines_warehouse_fk
      FOREIGN KEY (company_id, warehouse_id)
      REFERENCES company_warehouses(company_id, id)
      ON DELETE RESTRICT;

    CREATE TABLE inventory_valuation_balances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      item_id uuid NOT NULL,
      warehouse_id uuid NOT NULL,
      quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      total_cost_paise bigint NOT NULL DEFAULT 0 CHECK (total_cost_paise >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, item_id, warehouse_id),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, warehouse_id) REFERENCES company_warehouses(company_id, id) ON DELETE RESTRICT
    );

    ALTER TABLE inventory_valuation_balances ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inventory_valuation_balances FORCE ROW LEVEL SECURITY;
    CREATE POLICY inventory_valuation_balances_tenant_isolation ON inventory_valuation_balances
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON inventory_valuation_balances TO ledgerloop_app;

    CREATE INDEX inventory_valuation_balances_company_item_idx
      ON inventory_valuation_balances(company_id, item_id);
    CREATE INDEX inventory_valuation_balances_company_warehouse_idx
      ON inventory_valuation_balances(company_id, warehouse_id);

    INSERT INTO inventory_valuation_balances (company_id, item_id, warehouse_id, quantity, total_cost_paise)
    SELECT company_id, item_id, warehouse_id,
           SUM(quantity)::numeric(20,6),
           SUM(total_cost_paise)::bigint
      FROM inventory_movements
     GROUP BY company_id, item_id, warehouse_id
    HAVING SUM(quantity) > 0;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM inventory_movements
         GROUP BY company_id, item_id, warehouse_id
        HAVING SUM(quantity) < 0
      ) THEN
        RAISE EXCEPTION 'Cannot initialize inventory valuation: existing inventory movement balance is negative';
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS inventory_valuation_balances');
  pgm.sql('ALTER TABLE purchase_bill_lines DROP CONSTRAINT IF EXISTS purchase_bill_lines_warehouse_fk');
  pgm.sql('ALTER TABLE sales_invoice_lines DROP CONSTRAINT IF EXISTS sales_invoice_lines_warehouse_fk');
  pgm.sql('ALTER TABLE purchase_bill_lines DROP COLUMN IF EXISTS warehouse_id');
  pgm.sql('ALTER TABLE sales_invoice_lines DROP COLUMN IF EXISTS warehouse_id');
};
