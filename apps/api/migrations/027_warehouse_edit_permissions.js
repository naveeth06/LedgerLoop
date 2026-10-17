exports.up = (pgm) => {
  pgm.sql('GRANT UPDATE ON company_warehouses TO ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.sql('REVOKE UPDATE ON company_warehouses FROM ledgerloop_app');
};
