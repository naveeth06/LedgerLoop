exports.up = (pgm) => {
  // Allow a transaction authenticated as a user to list only that user's
  // memberships across companies. Tenant-scoped writes still require the
  // current company context in WITH CHECK.
  pgm.sql('DROP POLICY company_memberships_tenant_isolation ON company_memberships');
  pgm.sql(
    "CREATE POLICY company_memberships_tenant_isolation ON company_memberships " +
    "USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid " +
    "OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid) " +
    "WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)"
  );
};

exports.down = (pgm) => {
  pgm.sql('DROP POLICY company_memberships_tenant_isolation ON company_memberships');
  pgm.sql(
    "CREATE POLICY company_memberships_tenant_isolation ON company_memberships " +
    "USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid) " +
    "WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)"
  );
};
