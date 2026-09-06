# Reconcile orders and receipts

中文 | [English](instruction.en.md)

Read `/workspace/input.json`. Deduplicate identical receipts by `receipt_id`,
aggregate received quantity and amount by `order_id`, and produce one row per order.
Amounts are integer cents. Deltas are received minus ordered values.
Status is `missing` if there are no receipts, `matched` if both deltas are zero,
otherwise `mismatch`. Return exactly the order IDs from the input, without duplicates.

Write `/workspace/output/response.json` with this structure:

```json
{"rows": [{"order_id": "A", "quantity_delta": 0, "amount_delta": 0, "status": "matched"}]}
```

The HTTP adapter sends the input as a JSON POST and saves the JSON response here.
An ordinary Agent can instead implement the same requirements directly.
The fixture contains valid records only; conflicting duplicate receipts and invalid
input handling are outside this teaching task's contract.
