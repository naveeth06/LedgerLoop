exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE inventory_movements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      item_id uuid NOT NULL,
      warehouse_id uuid NOT NULL,
      movement_date date NOT NULL,
      movement_type text NOT NULL CHECK (movement_type IN ('opening','purchase','sale','adjustment','return_in','return_out')),
      quantity numeric(20,6) NOT NULL CHECK (quantity <> 0),
      unit_cost_paise numeric(20,6) NOT NULL CHECK (unit_cost_paise >= 0),
      total_cost_paise bigint NOT NULL,
      source_type text NOT NULL,
      source_id uuid,
      journal_entry_id uuid,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, item_id) REFERENCES items(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, warehouse_id) REFERENCES warehouses(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT,
      CHECK ((quantity > 0 AND movement_type IN ('opening','purchase','return_in','adjustment')) OR
             (quantity < 0 AND movement_type IN ('sale','return_out','adjustment')))
    );
    ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;
    CREATE POLICY inventory_movements_tenant_isolation ON inventory_movements
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT ON inventory_movements TO ledgerloop_app;
    CREATE INDEX inventory_movements_company_item_warehouse_date_idx ON inventory_movements(company_id, item_id, warehouse_id, movement_date, created_at);
    CREATE INDEX inventory_movements_company_source_idx ON inventory_movements(company_id, source_type, source_id);
  `);
};
exports.down = (pgm) => { pgm.sql('DROP TABLE IF EXISTS inventory_movements'); };
