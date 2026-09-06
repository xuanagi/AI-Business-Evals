# Reconcile orders and receipts

[中文](instruction.md) | English

Read `/workspace/input.json`. Deduplicate identical receipts by `receipt_id`, aggregate received quantity and amount by `order_id`, and produce one row per order. Amounts are integer cents; deltas are received minus ordered values. Use `missing` when there are no receipts, `matched` when both deltas are zero, and `mismatch` otherwise. Return exactly the order IDs from the input, without duplicates.

Write `/workspace/output/response.json` with:

```json
{"rows": [{"order_id": "A", "quantity_delta": 0, "amount_delta": 0, "status": "matched"}]}
```

The HTTP adapter sends the input as a JSON POST and saves the JSON response here. A normal Agent may implement the same requirements directly. The fixture contains valid records only; conflicting duplicate receipts and invalid-input handling are outside this teaching Task’s contract.
