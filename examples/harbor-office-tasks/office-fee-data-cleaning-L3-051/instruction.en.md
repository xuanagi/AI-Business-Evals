# Product and fee data cleaning

[中文](instruction.md) | English

You are a product-operations data assistant. Read the source material under `input` without network access and never modify or overwrite the originals.

Read the four product-summary PDFs in `fund_product_summaries`, `raw_fee_table.xlsx`, `risk_codebook.xlsx`, `standard_schema.json`, and `ops_profile_notes.md`. Consolidate them into one consistent, traceable Excel workbook.

Requirements:

1. In `Processing Notes`, list files, sheets, columns, and valid row counts actually read.
2. Follow the standard names and rules in `standard_schema.json`; do not add unsupported business facts.
3. Normalize product name/ID, share class, fee type/value/unit, and effective date.
4. Merge products only when an alias is explicit in the source; otherwise put the record in `Anomalies`.
5. Map risk levels with `risk_codebook.xlsx`. Do not infer a standard risk level from marketing prose.
6. Check blanks, exact duplicates, mixed units, invalid dates, and conflicts; remove only confirmed exact duplicates.
7. Keep source file, sheet or PDF, and row/section for every product and fee record so a reviewer can trace it back.
8. Do not estimate missing management or total fees. Treat channel discounts as anomaly notes, not standard-rate overrides; keep ESG only as an internal tag.

Keep the English column names required by `standard_schema.json`. `Fee Details` must include `canonical_product_id`, `share_class`, `fee_section`, `fee_type`, `investor_group`, `condition`, `fee_value`, `fee_unit`, `effective_date`, and `source_trace`; the other required columns belong in `Product Comparison`, `Risk Level`, and `Anomalies` as specified by that schema.

Write `output/result.xlsx` with five sheets:

- `Product Comparison`: product/share-class facts, risk, suitability, and sources;
- `Fee Details`: normalized sales, operating, and total fees;
- `Risk Level`: source wording, standard level, and basis;
- `Anomalies`: unmatched, missing, conflicting, discounted, and suspected duplicate records; and
- `Processing Notes`: inputs, before/after counts, deduplication, column mapping, unit conversion, and limits.

Store amounts, ratios, and dates as Excel values suitable for calculation, sorting, and filtering. Do not recommend products or infer risk. Reopen the workbook and confirm all five sheets, explainable row counts, and explicit anomaly reasons.
