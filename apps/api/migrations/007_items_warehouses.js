exports.up = (pgm) => {
  pgm.createTable('company_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    item_code: { type: 'varchar(32)', notNull: true },
    name: { type: 'text', notNull: true },
    item_type: { type: 'text', notNull: true, default: 'goods' },
    hsn_sac: { type: 'varchar(8)' },
    unit_code: { type: 'varchar(16)', notNull: true, default: 'unit' },
    gst_rate_bps: { type: 'integer', notNull: true, default: 0 },
    selling_price_paise: { type: 'bigint', notNull: true, default: 0 },
    purchase_price_paise: { type: 'bigint', notNull: true, default: 0 },
    track_inventory: { type: 'boolean', notNull: true, default: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('company_items', 'company_items_type_check', { check: "item_type IN ('goods', 'service')" });
  pgm.addConstraint('company_items', 'company_items_hsn_sac_format_check', { check: "hsn_sac IS NULL OR hsn_sac ~ '^[0-9]{4,8}$'" });
  pgm.addConstraint('company_items', 'company_items_gst_rate_bps_check', { check: 'gst_rate_bps >= 0 AND gst_rate_bps <= 10000' });
  pgm.addConstraint('company_items', 'company_items_selling_price_nonnegative', { check: 'selling_price_paise >= 0' });
  pgm.addConstraint('company_items', 'company_items_purchase_price_nonnegative', { check: 'purchase_price_paise >= 0' });
  pgm.addConstraint('company_items', 'company_items_service_inventory_check', { check: "item_type = 'goods' OR track_inventory = false" });
  pgm.addConstraint('company_items', 'company_items_company_code_unique', { unique: ['company_id', 'item_code'] });
  pgm.createIndex('company_items', ['company_id', 'item_type', 'is_active']);
  pgm.createIndex('company_items', ['company_id', 'name']);
  pgm.sql('ALTER TABLE company_items ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE company_items FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY company_items_tenant_isolation ON company_items USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON company_items TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON company_items FROM ledgerloop_app');

  pgm.addConstraint('branches', 'branches_company_id_id_unique', { unique: ['company_id', 'id'] });
  pgm.createTable('company_warehouses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    company_id: { type: 'uuid', notNull: true, references: 'companies', onDelete: 'cascade' },
    branch_id: { type: 'uuid' },
    warehouse_code: { type: 'varchar(32)', notNull: true },
    name: { type: 'text', notNull: true },
    address: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_by: { type: 'uuid', references: 'app_users', onDelete: 'set null' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("ALTER TABLE company_warehouses ADD CONSTRAINT company_warehouses_branch_same_company_fk FOREIGN KEY (company_id, branch_id) REFERENCES branches(company_id, id) ON DELETE RESTRICT");
  pgm.addConstraint('company_warehouses', 'company_warehouses_company_code_unique', { unique: ['company_id', 'warehouse_code'] });
  pgm.createIndex('company_warehouses', ['company_id', 'is_active']);
  pgm.createIndex('company_warehouses', ['company_id', 'branch_id']);
  pgm.sql('ALTER TABLE company_warehouses ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE company_warehouses FORCE ROW LEVEL SECURITY');
  pgm.sql("CREATE POLICY company_warehouses_tenant_isolation ON company_warehouses USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)");
  pgm.sql('GRANT SELECT, INSERT ON company_warehouses TO ledgerloop_app');
  pgm.sql('REVOKE UPDATE, DELETE ON company_warehouses FROM ledgerloop_app');
};
exports.down = (pgm) => {
  pgm.dropTable('company_warehouses');
  pgm.dropTable('company_items');
  pgm.dropConstraint('branches', 'branches_company_id_id_unique');
};
