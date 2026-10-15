exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE journal_entries
      ADD COLUMN reversal_of_id uuid,
      ADD CONSTRAINT journal_entries_reversal_company_fk
        FOREIGN KEY (company_id, reversal_of_id)
        REFERENCES journal_entries(company_id, id)
        ON DELETE RESTRICT;

    CREATE UNIQUE INDEX journal_entries_one_reversal_idx
      ON journal_entries(company_id, reversal_of_id)
      WHERE reversal_of_id IS NOT NULL;

    CREATE INDEX journal_entries_reversal_of_idx
      ON journal_entries(company_id, reversal_of_id)
      WHERE reversal_of_id IS NOT NULL;

    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_reversal_source_check
      CHECK ((reversal_of_id IS NULL) OR source_type = 'reversal');
  `);
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reversal_source_check');
  pgm.sql('DROP INDEX IF EXISTS journal_entries_reversal_of_idx');
  pgm.sql('DROP INDEX IF EXISTS journal_entries_one_reversal_idx');
  pgm.sql('ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reversal_company_fk');
  pgm.sql('ALTER TABLE journal_entries DROP COLUMN IF EXISTS reversal_of_id');
};
