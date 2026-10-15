exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE company_document_sequences
      ADD COLUMN expense_next bigint NOT NULL DEFAULT 1 CHECK (expense_next > 0),
      ADD COLUMN supplier_debit_note_next bigint NOT NULL DEFAULT 1 CHECK (supplier_debit_note_next > 0);

    CREATE TABLE expense_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      expense_number varchar(40) NOT NULL,
      expense_date date NOT NULL,
      expense_account_id uuid NOT NULL,
      payment_account_id uuid NOT NULL,
      party_id uuid,
      description text NOT NULL,
      taxable_paise bigint NOT NULL CHECK (taxable_paise > 0),
      cgst_paise bigint NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
      sgst_paise bigint NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
      igst_paise bigint NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
      total_paise bigint NOT NULL CHECK (total_paise > 0),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
      journal_entry_id uuid,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, expense_number),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, expense_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, payment_account_id) REFERENCES ledger_accounts(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT,
      CHECK(expense_account_id <> payment_account_id),
      CHECK(taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise)
    );
    ALTER TABLE expense_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE expense_documents FORCE ROW LEVEL SECURITY;
    CREATE POLICY expense_documents_tenant_isolation ON expense_documents
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON expense_documents TO ledgerloop_app;

    CREATE TABLE supplier_debit_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      debit_note_number varchar(40) NOT NULL,
      note_date date NOT NULL,
      purchase_bill_id uuid NOT NULL,
      party_id uuid NOT NULL,
      taxable_paise bigint NOT NULL CHECK (taxable_paise > 0),
      cgst_paise bigint NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
      sgst_paise bigint NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
      igst_paise bigint NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
      total_paise bigint NOT NULL CHECK (total_paise > 0),
      reason text NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
      journal_entry_id uuid,
      created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, debit_note_number),
      UNIQUE(company_id, id),
      FOREIGN KEY(company_id, purchase_bill_id) REFERENCES purchase_bills(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, party_id) REFERENCES company_parties(company_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(company_id, journal_entry_id) REFERENCES journal_entries(company_id, id) ON DELETE RESTRICT,
      CHECK(taxable_paise + cgst_paise + sgst_paise + igst_paise = total_paise)
    );
    ALTER TABLE supplier_debit_notes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE supplier_debit_notes FORCE ROW LEVEL SECURITY;
    CREATE POLICY supplier_debit_notes_tenant_isolation ON supplier_debit_notes
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
      WITH CHECK (company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid);
    GRANT SELECT, INSERT, UPDATE ON supplier_debit_notes TO ledgerloop_app;

    CREATE INDEX expense_documents_company_date_idx ON expense_documents(company_id, expense_date);
    CREATE INDEX expense_documents_company_status_idx ON expense_documents(company_id, status);
    CREATE INDEX supplier_debit_notes_company_bill_idx ON supplier_debit_notes(company_id, purchase_bill_id);
    CREATE INDEX supplier_debit_notes_company_date_idx ON supplier_debit_notes(company_id, note_date);

    CREATE FUNCTION ledgerloop_guard_expense_document() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Posted or cancelled expenses are immutable; use a correction workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER expense_document_guard BEFORE UPDATE OR DELETE ON expense_documents FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_expense_document();

    CREATE FUNCTION ledgerloop_guard_supplier_debit_note() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Posted or cancelled supplier debit notes are immutable; use a correction workflow' USING ERRCODE = '55000';
      END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END; $$;
    CREATE TRIGGER supplier_debit_note_guard BEFORE UPDATE OR DELETE ON supplier_debit_notes FOR EACH ROW EXECUTE FUNCTION ledgerloop_guard_supplier_debit_note();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS supplier_debit_note_guard ON supplier_debit_notes');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_supplier_debit_note()');
  pgm.sql('DROP TRIGGER IF EXISTS expense_document_guard ON expense_documents');
  pgm.sql('DROP FUNCTION IF EXISTS ledgerloop_guard_expense_document()');
  pgm.sql('DROP TABLE IF EXISTS supplier_debit_notes');
  pgm.sql('DROP TABLE IF EXISTS expense_documents');
  pgm.sql('ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS supplier_debit_note_next');
  pgm.sql('ALTER TABLE company_document_sequences DROP COLUMN IF EXISTS expense_next');
};
