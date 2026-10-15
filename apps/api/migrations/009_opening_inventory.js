exports.up = (pgm) => {
  // Composite keys let inventory rows prove every referenced record belongs to the same tenant.
  pgm.addConstraint('company_items', 'company_items_company_id_id_unique', { unique: ['company_id', 'id'] });
  pgm.addConstraint('company_warehouses', 'company_warehouses_company_id_id_unique', { unique: ['company_id', 'id'] });

  pgm.createTable('opening_inventory', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    item_id: { type: 'uuid', notNull: true },
    warehouse_id: { type: 'uuid', notNull: true },
    journal_entry_id: { type: 'uuid', notNull: true },
    opening_date: { type: 'date', notNull: true },
    quantity: { type: 'numeric(20,6)', notNull: true },
    unit_cost_paise: { type: 'bigint', notNull: true },
    total_value_paise: { type: 'bigint', notNull: true },
    created_by: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'restrict' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("ALTER TABLE opening_inventory ADD CONSTRAINT opening_inventory_item_company_fk FOREIGN KEY (company_id, item_id) REFERENCES company_items(company_id, id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE opening_inventory ADD CONSTRAINT opening_inventory_warehouse_company_fk FOREIGN KEY (company_id, warehouse_id) REFERENCES company_warehouses(company_id, id) ON DELETE RESTRICT");
  pgm.sql("ALTER TABLE opening_inventory ADD CONSTRAINT opening_inventory_journal_company_fk FOREIGN KEY (company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT");
  pgm.addConstraint('opening_inventory', 'opening_inventory_positive_quantity_check', { check: 'quantity > 0' });
  pgm.addConstraint('opening_inventory', 'opening_inventory_positive_cost_check', { check: 'unit_cost_paise > 0' });
  pgm.addConstraint('opening_inventory', 'opening_inventory_positive_value_check', { check: 'total_value_paise > 0' });
  pgm.addConstraint('opening_inventory', 'opening_inventory_item_warehouse_unique', { unique: ['company_id', 'item_id', 'warehouse_id'] });
  pgm.createIndex('opening_inventory', ['company_id', 'opening_date']);
  pgm.createIndex('opening_inventory', ['company_id', 'journal_entry_id']);
  pgm.sql('ALTER TABLE opening_inventory ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE opening_inventory FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY opening_inventory_tenant_isolation ON opening_inventory USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON opening_inventory TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON opening_inventory FROM ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('opening_inventory');
  pgm.dropConstraint('company_warehouses', 'company_warehouses_company_id_id_unique');
  pgm.dropConstraint('company_items', 'company_items_company_id_id_unique');
};
