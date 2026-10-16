# Banking workspace

The authenticated `/banking` workspace exposes the existing tenant-scoped banking APIs without changing accounting contracts.

## Workflow

1. Select **Add bank account**.
2. Choose an existing active asset ledger account from Chart of Accounts and connect it to the bank account.
3. Select the connected bank account.
4. Import a JSON statement. The API accepts 1–10,000 rows per import and safely skips duplicate external IDs.
5. Review imported statement transactions.
6. For an unreconciled transaction, open **Review** to request server-side reconciliation suggestions.
7. Select a matching posted journal line to reconcile it.

Reconciliation remains user-approved. The API enforces the bank ledger account, amount, posted status, three-day date window, and one-match-per-journal-line rule. The UI never posts accounting entries during reconciliation.

## Statement JSON shape

```json
{
  "sourceName": "Example Bank October 2026",
  "rows": [
    {
      "transactionDate": "2026-10-16",
      "valueDate": "2026-10-16",
      "transactionType": "credit",
      "amountPaise": "2500000",
      "description": "Customer payment",
      "reference": "UTR123",
      "externalId": "BANK-001",
      "balanceAfterPaise": "12500000"
    }
  ]
}
```

The frontend converts no monetary values during import; statement amounts remain integer paise end-to-end.
