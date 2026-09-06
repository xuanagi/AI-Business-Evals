# Reconcile purchase orders and receipts

[中文](instruction.md) | English

You are a procurement reconciliation assistant. Read `input/采购订单.csv` (purchase orders) and `input/入库记录.csv` (receipts) without network access and never modify or overwrite the originals.

Identify quantity and amount differences, orders with no receipt, and receipts with no matching order.

Rules:

1. The purchase-order key is `ORDER_ID`.
2. Receipt numbers are `RECEIPT_NO` in the form `order-id-NN`; remove the final sequence to match `ORDER_ID`.
3. Map `SUPPLIER` to `VENDOR_NAME`, `ITEM_NAME` to `PRODUCT_DESC`, `ORDER_QTY` to `RECV_QTY`, and `TOTAL_AMOUNT` to `RECV_AMOUNT`.
4. An order may have several receipts; aggregate received quantity and amount by order before comparing.
5. Allow an amount tolerance of 0.01 yuan; quantities must match exactly.
6. Never join by row number or file order.
7. Check blanks, duplicates, unparseable receipt numbers, and supplier/product mismatches; quality issues must not change quantity/amount classification.
8. A linked order with a quantity or amount difference is not “missing”.

Write `output/result.xlsx` with seven sheets: `Reconciliation Summary`, `Matched`, `Quantity Differences`, `Amount Differences`, `One-sided Records`, `Data Quality`, and `Processing Notes`.

`Matched` contains only orders matching in both quantity and amount. Quantity and amount differences may be listed separately; the summary must state overlap when an order has both. `One-sided Records` distinguishes missing-order receipts, missing receipts, and unparseable records. Keep original IDs, supplier, product, and source row numbers. Store quantities, amounts, and deltas as Excel numbers and reconcile summary/detail totals.

The four detail sheets must support review by business key, not row-count placeholders. The matched/difference sheets include order ID, ordered quantity, aggregated received quantity, ordered amount, aggregated received amount, quantity delta, amount delta, and source rows; one-sided records include original ID, type, supplier, product, and source row. Each key occurs once per sheet; aggregate multiple receipts before writing one row.
