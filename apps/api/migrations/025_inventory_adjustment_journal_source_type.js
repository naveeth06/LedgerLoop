exports.up = (pgm) => {
  pgm.dropConstraint('journal_entries', 'journal_entries_source_type_check');
  pgm.addConstraint('journal_entries', 'journal_entries_source_type_check', {
    check: "source_type IN ('manual', 'opening_balance', 'invoice', 'receipt', 'bill', 'payment', 'expense', 'reversal', 'inventory_adjustment')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('journal_entries', 'journal_entries_source_type_check');
  pgm.addConstraint('journal_entries', 'journal_entries_source_type_check', {
    check: "source_type IN ('manual', 'opening_balance', 'invoice', 'receipt', 'bill', 'payment', 'expense', 'reversal')",
  });
};
