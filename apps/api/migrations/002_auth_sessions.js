exports.up = (pgm) => {
  pgm.createTable('auth_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'app_users', onDelete: 'cascade' },
    family_id: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
    token_hash: { type: 'char(64)', notNull, unique: true },
    expires_at: { type: 'timestamptz', notNull },
    revoked_at: { type: 'timestamptz' },
    replaced_by_session_id: { type: 'uuid', references: 'auth_sessions', onDelete: 'set null' },
    last_used_at: { type: 'timestamptz' },
    user_agent: { type: 'text' },
    ip_address: { type: 'inet' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('auth_sessions', ['user_id', 'created_at']);
  pgm.createIndex('auth_sessions', ['family_id']);
  pgm.createIndex('auth_sessions', ['expires_at']);
  pgm.sql('GRANT SELECT, INSERT, UPDATE ON auth_sessions TO ledgerloop_app');
  pgm.sql('REVOKE DELETE ON auth_sessions FROM ledgerloop_app');
};

exports.down = (pgm) => {
  pgm.dropTable('auth_sessions');
};
