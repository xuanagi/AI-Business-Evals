# Channel settlement and payment anomaly analysis

[中文](instruction.md) | English

You are a channel-operations analyst. Read the channel settlement and payment-detail files in `input` without network access and never modify or overwrite the originals.

Compare key metrics for each channel partner over the requested periods, identify material changes, data-quality problems, and items that require business confirmation. Keep source-supported facts separate from hypotheses.

Data preparation:

1. List both files’ sheets, columns, original row counts, and time ranges.
2. Remove exact duplicates before aggregation and record before count, removed count, and after count.
3. Exclude rows with blank or unrecognized `QUARTER` from aggregation and record their counts and sources in `Data Quality`.
4. Do not merge similar channel names automatically.

Comparison definitions:

1. Settlement: compare Q1 2026 with Q4 2025 for GMV, revenue, commission rate, and order volume.
2. Payments: compare Q1 2026 with Q1 2025 for GMV, revenue, enterprise-side earnings, and headcount.
3. Enterprise-side earnings equal revenue minus platform and service fees; commission rate equals commission divided by GMV.
4. Show both periods, delta, and percentage change. When the earlier period is zero, write `earlier period is zero` rather than dividing by zero.
5. Flag absolute percentage changes above 20% as major anomalies. Also flag commission rates below 0, above 100%, or with relative changes above 20%.
6. If evidence does not support a possible cause, write `business confirmation required`; do not invent one.

Use filterable long tables: one channel partner + metric per row, with partner, metric, prior value, current value, delta, and percentage change. Compare payment headcount using the average of valid records per period, not a sum of daily headcounts. `Data Quality` must record original rows, exact duplicates, post-dedup rows, invalid/blank quarters, and whether those rows entered aggregation for both files.

Write `output/result.xlsx` with `Settlement Comparison`, `Payment Comparison`, `Key Anomalies`, `Data Quality`, and `Processing Notes`. `Key Anomalies` must include partner, metric, prior/current values, delta, percentage change, trigger rule, evidence, possible cause, and confirmation flag. Recheck that all aggregates use deduplicated data and trace to the source files.
